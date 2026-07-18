import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import { RunRedactor, assertSanitizedEvidence } from "./redaction";
import type { H1Ledger } from "./run-ledger";
import type { H1Scenario } from "./contracts";
import type { ProviderFixture } from "./fixture-manifest";
import type { RefundFixtureIds } from "./cleanup";
import { budgetRecordsFromPayload } from "./call-budget";

export async function buildSanitizedReport(input: Readonly<{
  client: PrismaClient;
  ledger: H1Ledger;
  scenarioId: H1Scenario;
  fixture: ProviderFixture;
  hmacKey: Buffer;
  rawDirectory: string;
  refund: RefundFixtureIds | null;
  now?: Date;
}>): Promise<Readonly<Record<string, unknown>>> {
  const redactor = new RunRedactor(input.hmacKey);
  const projection = input.refund
    ? await loadProjection(input.client, input.refund)
    : emptyProjection();
  const rawArtifacts = await sanitizedRawArtifacts(input.rawDirectory);
  const transactionKey = input.refund
    ? await input.client.refundAttempt.findUnique({ where: { id: input.refund.refundAttemptId }, select: { providerRefundId: true } }).then((row) => row?.providerRefundId ?? null)
    : null;
  const budgets = budgetCounts(input.ledger.payload.budgets);
  const report = assembleReport(input, redactor, projection, rawArtifacts, transactionKey, budgets);
  assertSanitizedEvidence(report);
  return report;
}

function assembleReport(
  input: Parameters<typeof buildSanitizedReport>[0],
  redactor: RunRedactor,
  projection: Awaited<ReturnType<typeof loadProjection>> | ReturnType<typeof emptyProjection>,
  rawArtifacts: Awaited<ReturnType<typeof sanitizedRawArtifacts>>,
  transactionKey: string | null,
  budgets: Readonly<{ GET: number; POST: number }>,
): Readonly<Record<string, unknown>> {
  const postRequests = budgetRecordsFromPayload(input.ledger.payload.callRecords)
    .filter((entry) => entry.kind === "POST" && entry.phase === "INTENT")
    .map((entry) => entry.request);
  const latestPost = postRequests.at(-1);
  const identity = reportIdentity(input.ledger, latestPost);
  return Object.freeze({
    formatVersion: "mira-toss-sbx-sanitized/v1",
    runId: input.ledger.runId,
    scenarioId: input.scenarioId,
    repositoryCommit: input.ledger.repositoryCommit,
    policyHashes: input.ledger.policyHashes,
    runnerSourceHash: input.ledger.runnerSourceHash,
    migrationFingerprint: input.ledger.migrationFingerprint,
    scenarioInputHash: input.ledger.scenarioInputHash,
    startedAt: stringOrNull(input.ledger.payload.startedAt),
    finishedAt: (input.now ?? new Date()).toISOString(),
    provider: "TOSS",
    mode: "SANDBOX",
    amount: input.fixture.amount,
    currency: "KRW",
    paymentKeyHmac: redactor.hmac(input.fixture.paymentKey),
    operationKeyHmac: redactor.hmac(identity.operationKey),
    wireFingerprintHmac: redactor.hmac(identity.wireFingerprint),
    transactionKeyHmac: redactor.hmac(transactionKey),
    getCount: budgets.GET,
    postCount: budgets.POST,
    normalizedProviderOutcome: input.ledger.payload.resultCode ?? null,
    httpStatusClass: null,
    staticLocalResultCodes: Array.isArray(input.ledger.payload.resultCode) ? input.ledger.payload.resultCode : [],
    localProjection: projection,
    booleans: evidenceBooleans(input, postRequests),
    rawArtifacts,
    scenarioLimitations: limitations(input.scenarioId),
    s6Executed: input.scenarioId === "S6" && input.ledger.payload.resultCode !== "SKIPPED_NOT_AVAILABLE",
    completionMarker: "SEALED",
  });
}

function reportIdentity(
  ledger: H1Ledger,
  latest: Readonly<{ operationKey: string | null; wireFingerprint: string | null }> | undefined,
) {
  return Object.freeze({
    operationKey: stringOrNull(ledger.payload.operationKey) ?? latest?.operationKey ?? null,
    wireFingerprint: stringOrNull(ledger.payload.wireFingerprint) ?? latest?.wireFingerprint ?? null,
  });
}

function evidenceBooleans(
  input: Parameters<typeof buildSanitizedReport>[0],
  posts: readonly Readonly<{ operationKey: string | null; canonicalBody: string | null }>[],
) {
  const operationKeys = posts.flatMap((post) => post.operationKey ? [post.operationKey] : []);
  const bodies = posts.flatMap((post) => post.canonicalBody ? [post.canonicalBody] : []);
  const resultCodes = Array.isArray(input.ledger.payload.resultCode)
    ? input.ledger.payload.resultCode : [];
  return Object.freeze({
    sameOperationKey: posts.length > 1 ? new Set(operationKeys).size === 1 : null,
    sameBody: posts.length > 1 ? new Set(bodies).size === 1 : null,
    sameTransactionKey: null,
    singleCancellation: null,
    noSecondPost: input.scenarioId === "S2" ? posts.length === 1 : null,
    recoveredByLookup: input.scenarioId === "S2" ? resultCodes.includes("RECOVERED") : null,
    cleanupComplete: false,
  });
}

async function loadProjection(client: PrismaClient, refund: RefundFixtureIds) {
  const [attempt, command, transitions, dispatches, proofs, evidence] = await Promise.all([
    client.refundAttempt.findUniqueOrThrow({ where: { id: refund.refundAttemptId }, select: { status: true, order: { select: { status: true } } } }),
    client.refundExecutionCommand.findUniqueOrThrow({ where: { id: refund.commandId }, select: { status: true, leaseOwner: true, leaseUntil: true, leaseTokenHash: true } }),
    client.refundAttemptTransition.count({ where: { refundAttemptId: refund.refundAttemptId } }),
    client.refundExecutionDispatchAttempt.findMany({ where: { commandId: refund.commandId }, select: { ordinal: true } }),
    client.refundExecutionProviderContactEligibilityProof.count({ where: { dispatchAttempt: { commandId: refund.commandId } } }),
    client.refundExecutionEvidence.count({ where: { commandId: refund.commandId } }),
  ]);
  return Object.freeze({
    commandStatus: command.status,
    attemptStatus: attempt.status,
    orderStatus: attempt.order.status,
    dispatchCount: dispatches.length,
    latestOrdinal: dispatches.reduce((maximum, row) => Math.max(maximum, row.ordinal), 0),
    contactProofCount: proofs,
    evidenceCount: evidence,
    transitionCount: transitions,
    leaseCleared: command.leaseOwner === null && command.leaseUntil === null && command.leaseTokenHash === null,
  });
}

function emptyProjection() {
  return Object.freeze({
    commandStatus: null, attemptStatus: null, orderStatus: null, dispatchCount: 0,
    latestOrdinal: 0, contactProofCount: 0, evidenceCount: 0, transitionCount: 0,
    leaseCleared: true,
  });
}

async function sanitizedRawArtifacts(directory: string) {
  const names = (await readdir(directory)).filter((name) => name !== "hmac.key").sort();
  return Promise.all(names.map(async (name) => {
    const path = `${directory}/${name}`;
    const [body, metadata] = await Promise.all([readFile(path), stat(path)]);
    return Object.freeze({ hash: createHash("sha256").update(body).digest("hex"), size: metadata.size });
  }));
}

function budgetCounts(value: unknown): Readonly<{ GET: number; POST: number }> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return Object.freeze({ GET: 0, POST: 0 });
  const get: unknown = Reflect.get(value, "GET");
  const post: unknown = Reflect.get(value, "POST");
  return Object.freeze({
    GET: typeof get === "number" ? get : 0,
    POST: typeof post === "number" ? post : 0,
  });
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function limitations(scenarioId: H1Scenario): readonly string[] {
  if (scenarioId === "S2") return Object.freeze(["Process-level response discard; not TCP-level loss."]);
  if (scenarioId === "S5") return Object.freeze(["Ordinal-2 application path; provider duplicate POST is covered by S3."]);
  return Object.freeze([]);
}
