import type {
  TossRefundCancellationPort,
  TossRefundCancellationTransportResult,
} from "../../src/lib/payment/refund/providers/toss/refund-cancellation-http";
import {
  normalizeTossRefundCancellationSuccess,
} from "../../src/lib/payment/refund/providers/toss/refund-cancellation-response";
import type {
  TossRefundLookupHttpResult,
  TossRefundLookupPort,
} from "../../src/lib/payment/refund/providers/toss/refund-lookup-http";
import { extractTossRefundEligibilityResponse } from "../../src/lib/payment/refund/providers/toss/refund-lookup-response";
import { normalizeTossRefundRecoveryLookup } from "../../src/lib/payment/refund/providers/toss/refund-recovery-lookup";
import { deriveTossRefundOperationKey } from "../../src/lib/payment/refund/providers/toss/refund-operation-key";
import { fingerprintTossRefundWireRequest } from "../../src/lib/payment/refund/providers/toss/refund-wire-fingerprint";
import {
  deriveTossRefundCancellationWireRequest,
  type TossRefundCancellationWireRequest,
} from "../../src/lib/payment/refund/providers/toss/refund-wire-request";
import {
  H1_CHANGED_CANCEL_REASON,
  protectedPostRequest,
  type ProviderCallBudget,
  type S3CompletionEvidence,
  type S3Continuation,
  type S3HistoryExpectation,
} from "./call-budget";
import type { ProviderFixture } from "./fixture-manifest";
import {
  assertExactS3ReplayCallHistory,
  classifyS3History,
  createS3HistoryExpectation,
  s3ContinuationStart,
  type S3CommandAuthority,
} from "./resume-planner";
import type { ScenarioDependencies, ScenarioResult } from "./scenario-orchestrator";

export type ProbePost = (
  wire: TossRefundCancellationWireRequest,
  canonicalBody: string,
) => Promise<TossRefundCancellationTransportResult>;

type ProbeDependencies = Pick<
  ScenarioDependencies,
  "budget" | "lookup" | "cancellation" | "probePost" | "probeAuthorization"
> & Readonly<{
  s3Authority?: S3CommandAuthority;
  s3Continuation?: S3Continuation;
}>;

export async function executeProviderProbe(
  dependencies: ProbeDependencies,
  input: Readonly<{ runId: string; scenarioId: "S3" | "S4"; fixture: ProviderFixture }>,
): Promise<ScenarioResult> {
  if (input.scenarioId === "S4") {
    return executeS4Probe(dependencies, Object.freeze({ ...input, scenarioId: "S4" }));
  }
  return executeS3Probe(dependencies, Object.freeze({ ...input, scenarioId: "S3" }));
}

async function executeS3Probe(
  dependencies: ProbeDependencies,
  input: Readonly<{ runId: string; scenarioId: "S3"; fixture: ProviderFixture }>,
): Promise<ScenarioResult> {
  const expectation = createS3HistoryExpectation(input.runId, input.fixture);
  dependencies.budget.assertS3TransactionIdentityProtection();
  const initial = classifyS3History(dependencies.budget.history("S3"), expectation);
  if (initial.kind === "FAILED" || initial.kind === "INCOMPLETE"
    || initial.kind === "MALFORMED") throw s3ProbeFailure();
  const authority = requireS3Authority(dependencies.s3Authority);
  const continuation = requireS3Continuation(dependencies.s3Continuation);
  const firstStep = s3ContinuationStart(continuation, initial);
  if (firstStep <= 1) await executeInitialS3Lookup(dependencies, input.fixture, expectation, authority);
  if (firstStep <= 2) await executeS3Post(dependencies, input.fixture, expectation, 2, authority);
  if (firstStep <= 3) await executeS3Post(dependencies, input.fixture, expectation, 3, authority);
  if (firstStep <= 4) await executeFinalS3Lookup(dependencies, input.fixture, expectation, authority);
  return completeS3DurableProof(input.runId, input.fixture, dependencies.budget.history("S3"));
}

export function completeS3DurableProof(
  runId: string,
  fixture: ProviderFixture,
  history: unknown,
): ScenarioResult {
  const expectation = createS3HistoryExpectation(runId, fixture);
  assertExactS3ReplayCallHistory(history, expectation);
  return s3ReplayResult(probeRequest(runId, "S3", fixture));
}

async function executeInitialS3Lookup(
  dependencies: ProbeDependencies,
  fixture: ProviderFixture,
  expectation: S3HistoryExpectation,
  authority: S3CommandAuthority,
): Promise<void> {
  assertS3CompletedSteps(dependencies.budget, expectation, 0);
  const capability = await dependencies.budget.authorizeS3Continuation(authority);
  await dependencies.budget.invokeAuthorizedS3Lookup(
    capability,
    dependencies.lookup,
    dependencies.probeAuthorization,
    (result) => initialLookupEvidence(result, fixture),
  );
  assertS3CompletedSteps(dependencies.budget, expectation, 1);
}

async function executeS3Post(
  dependencies: ProbeDependencies,
  fixture: ProviderFixture,
  expectation: S3HistoryExpectation,
  step: 2 | 3,
  authority: S3CommandAuthority,
): Promise<void> {
  assertS3CompletedSteps(dependencies.budget, expectation, step === 2 ? 1 : 2);
  const capability = await dependencies.budget.authorizeS3Continuation(authority);
  await dependencies.budget.invokeAuthorizedS3Cancellation(
    capability,
    requireS3Cancellation(dependencies.cancellation),
    dependencies.probeAuthorization,
    (result) => postEvidence(result, fixture, dependencies.budget),
  );
  assertS3CompletedSteps(dependencies.budget, expectation, step);
}

async function executeFinalS3Lookup(
  dependencies: ProbeDependencies,
  fixture: ProviderFixture,
  expectation: S3HistoryExpectation,
  authority: S3CommandAuthority,
): Promise<void> {
  assertS3CompletedSteps(dependencies.budget, expectation, 3);
  const capability = await dependencies.budget.authorizeS3Continuation(authority);
  await dependencies.budget.invokeAuthorizedS3Lookup(
    capability,
    dependencies.lookup,
    dependencies.probeAuthorization,
    (result) => finalLookupEvidence(result, fixture, dependencies.budget),
  );
  assertS3CompletedSteps(dependencies.budget, expectation, 4);
}

async function executeS4Probe(
  dependencies: ProbeDependencies,
  input: Readonly<{ runId: string; scenarioId: "S4"; fixture: ProviderFixture }>,
): Promise<ScenarioResult> {
  const lookup = dependencies.budget.wrapLookup("S4", dependencies.lookup);
  const firstLookup = await lookup(input.fixture.paymentKey, dependencies.probeAuthorization);
  assertProbeEligibility(firstLookup, input.fixture);
  const request = probeRequest(input.runId, "S4", input.fixture);
  await postS4Probe(dependencies.budget, dependencies.probePost, request.wire, request.firstBody);
  await postS4Probe(dependencies.budget, dependencies.probePost, request.wire, request.secondBody);
  await lookup(input.fixture.paymentKey, dependencies.probeAuthorization);
  return s4ProbeResult(request);
}

function assertS3CompletedSteps(
  budget: ProviderCallBudget,
  expectation: S3HistoryExpectation,
  completedSteps: 0 | 1 | 2 | 3 | 4,
): void {
  const history = classifyS3History(budget.history("S3"), expectation);
  const matches = completedSteps === 0
    ? history.kind === "EMPTY"
    : completedSteps === 4
      ? history.kind === "COMPLETE_SUCCESS"
      : history.kind === "SUCCESSFUL_PREFIX" && history.completedSteps === completedSteps;
  if (!matches) throw s3ProbeFailure();
}

function initialLookupEvidence(
  result: TossRefundLookupHttpResult,
  fixture: ProviderFixture,
): S3CompletionEvidence {
  if (result.kind === "unavailable") return completion("INITIAL_GET_UNAVAILABLE");
  if (result.kind === "rejected") return completion("INITIAL_GET_REJECTED");
  const normalized = extractTossRefundEligibilityResponse(result.body, {
    paymentKey: fixture.paymentKey,
    conservativeNoLaterThanLookupTimestamp: Date.now(),
  });
  if (normalized.kind === "ineligible") return completion("INITIAL_GET_INELIGIBLE");
  if (normalized.kind !== "eligible" || normalized.facts.totalAmount !== fixture.amount) {
    return completion("INITIAL_GET_REJECTED");
  }
  const body = parseBody(result.body);
  return isRecord(body) && body.orderId === fixture.providerOrderId
    ? completion("INITIAL_GET_ELIGIBLE")
    : completion("INITIAL_GET_REJECTED");
}

function postEvidence(
  result: TossRefundCancellationTransportResult,
  fixture: ProviderFixture,
  budget: ProviderCallBudget,
): S3CompletionEvidence {
  if (result.kind === "rejected") return completion("POST_REJECTED");
  if (result.kind === "unknown") return completion("POST_UNAVAILABLE");
  const normalized = normalizeTossRefundCancellationSuccess(result.body, {
    paymentKey: fixture.paymentKey,
    fullAmount: fixture.amount,
  });
  if (!normalized.ok) return completion("POST_MALFORMED");
  return completion(
    "POST_ACCEPTED",
    budget.protectS3TransactionIdentity(normalized.candidate.transactionKey),
  );
}

function finalLookupEvidence(
  result: TossRefundLookupHttpResult,
  fixture: ProviderFixture,
  budget: ProviderCallBudget,
): S3CompletionEvidence {
  const transport = result.kind === "response"
    ? Object.freeze({ kind: "response" as const, body: new TextEncoder().encode(result.body) })
    : Object.freeze({ kind: result.kind });
  const normalized = normalizeTossRefundRecoveryLookup(transport, {
    paymentKey: fixture.paymentKey,
    fullAmount: fixture.amount,
    localReceivedAt: Date.now(),
  });
  if (normalized.kind === "EXACT_SUCCESS") {
    return completion(
      "FINAL_GET_EXACT_SUCCESS",
      budget.protectS3TransactionIdentity(normalized.success.transactionKey),
    );
  }
  if (normalized.kind === "LOOKUP_UNAVAILABLE") return completion("FINAL_GET_UNAVAILABLE");
  if (normalized.kind === "LOOKUP_REJECTED") return completion("FINAL_GET_REJECTED");
  return completion("FINAL_GET_MISMATCH");
}

function completion(
  classification: S3CompletionEvidence["classification"],
  transactionIdentityHmac: string | null = null,
): S3CompletionEvidence {
  return Object.freeze({ classification, transactionIdentityHmac });
}

function s3ReplayResult(request: ReturnType<typeof probeRequest>): ScenarioResult {
  return Object.freeze({
    scenarioId: "S3",
    ok: true,
    staticCodes: Object.freeze(["REPLAY_OBSERVED"]),
    operationKey: request.operationKey,
    wireFingerprint: request.wireFingerprint,
    limitations: Object.freeze([]),
  });
}

function s4ProbeResult(request: ReturnType<typeof probeRequest>): ScenarioResult {
  return Object.freeze({
    scenarioId: "S4",
    ok: true,
    staticCodes: Object.freeze(["CHANGED_REASON_OBSERVED"]),
    operationKey: request.operationKey,
    wireFingerprint: request.wireFingerprint,
    limitations: Object.freeze([]),
  });
}

function s3ProbeFailure(): Error {
  return new Error("S3_REPLAY_PROBE_FAILED");
}

function requireS3Authority(value: S3CommandAuthority | undefined): S3CommandAuthority {
  if (!value) throw new Error("S3_CONTINUATION_NOT_AUTHORIZED");
  return value;
}

function requireS3Continuation(value: S3Continuation | undefined): S3Continuation {
  if (!value) throw new Error("S3_CONTINUATION_NOT_AUTHORIZED");
  return value;
}

function requireS3Cancellation(
  value: TossRefundCancellationPort | undefined,
): TossRefundCancellationPort {
  if (!value) throw new Error("S3_CANCELLATION_ADAPTER_REQUIRED");
  return value;
}

function probeRequest(runId: string, scenarioId: "S3" | "S4", fixture: ProviderFixture) {
  const operationKey = deriveTossRefundOperationKey(`h1:${runId}:${scenarioId}`);
  const input = {
    paymentKey: fixture.paymentKey,
    providerOperationKey: operationKey,
    cancelAmount: fixture.amount,
  };
  const wire = deriveTossRefundCancellationWireRequest(input);
  const { firstBody, secondBody } = probeCanonicalBodies(scenarioId, fixture.amount, wire);
  return Object.freeze({
    operationKey,
    wire,
    firstBody,
    secondBody,
    wireFingerprint: fingerprintTossRefundWireRequest(input),
  });
}

export function probeCanonicalBodies(
  scenarioId: "S3" | "S4",
  amount: number,
  wire: TossRefundCancellationWireRequest,
) {
  const firstBody = JSON.stringify(wire.body);
  const secondBody = scenarioId === "S4"
    ? JSON.stringify({ cancelReason: H1_CHANGED_CANCEL_REASON, cancelAmount: amount })
    : firstBody;
  return Object.freeze({ firstBody, secondBody });
}

function postS4Probe(
  budget: ProviderCallBudget,
  port: ProbePost,
  wire: TossRefundCancellationWireRequest,
  body: string,
): Promise<TossRefundCancellationTransportResult> {
  return budget.invokeProtected(
    "S4",
    "POST",
    protectedPostRequest(wire, body),
    () => port(wire, body),
  );
}

function assertProbeEligibility(
  result: Awaited<ReturnType<TossRefundLookupPort>>,
  fixture: ProviderFixture,
): void {
  if (result.kind !== "response") throw new Error("PROBE_ELIGIBILITY_UNAVAILABLE");
  const parsed = extractTossRefundEligibilityResponse(result.body, {
    paymentKey: fixture.paymentKey,
    conservativeNoLaterThanLookupTimestamp: Date.now(),
  });
  if (parsed.kind !== "eligible" || parsed.facts.totalAmount !== fixture.amount) {
    throw new Error("PROBE_ELIGIBILITY_MISMATCH");
  }
  const body = parseBody(result.body);
  if (!isRecord(body) || body.orderId !== fixture.providerOrderId) {
    throw new Error("PROBE_ORDER_IDENTITY_MISMATCH");
  }
}

function parseBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
