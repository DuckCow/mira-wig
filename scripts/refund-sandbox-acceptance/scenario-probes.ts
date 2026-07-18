import type { TossRefundCancellationTransportResult } from "../../src/lib/payment/refund/providers/toss/refund-cancellation-http";
import type { TossRefundLookupPort } from "../../src/lib/payment/refund/providers/toss/refund-lookup-http";
import { extractTossRefundEligibilityResponse } from "../../src/lib/payment/refund/providers/toss/refund-lookup-response";
import { deriveTossRefundOperationKey } from "../../src/lib/payment/refund/providers/toss/refund-operation-key";
import { fingerprintTossRefundWireRequest } from "../../src/lib/payment/refund/providers/toss/refund-wire-fingerprint";
import {
  deriveTossRefundCancellationWireRequest, TOSS_REFUND_CANCEL_REASON,
  type TossRefundCancellationWireRequest,
} from "../../src/lib/payment/refund/providers/toss/refund-wire-request";
import { protectedPostRequest, type ProviderCallBudget } from "./call-budget";
import type { ProviderFixture } from "./fixture-manifest";
import type { ScenarioDependencies, ScenarioResult } from "./scenario-orchestrator";

export const H1_CHANGED_CANCEL_REASON = "Mira merchant refund H1 changed-reason probe";

export type ProbePost = (
  wire: TossRefundCancellationWireRequest,
  canonicalBody: string,
) => Promise<TossRefundCancellationTransportResult>;

type ProbeDependencies = Pick<
  ScenarioDependencies,
  "budget" | "lookup" | "probePost" | "probeAuthorization"
>;

export async function executeProviderProbe(
  dependencies: ProbeDependencies,
  input: Readonly<{ runId: string; scenarioId: "S3" | "S4"; fixture: ProviderFixture }>,
): Promise<ScenarioResult> {
  const lookup = dependencies.budget.wrapLookup(input.scenarioId, dependencies.lookup);
  const firstLookup = await lookup(input.fixture.paymentKey, dependencies.probeAuthorization);
  assertProbeEligibility(firstLookup, input.fixture);
  const request = probeRequest(input.runId, input.scenarioId, input.fixture);
  await postProbe(dependencies.budget, dependencies.probePost, input.scenarioId, request.wire, request.firstBody);
  await postProbe(dependencies.budget, dependencies.probePost, input.scenarioId, request.wire, request.secondBody);
  await lookup(input.fixture.paymentKey, dependencies.probeAuthorization);
  return Object.freeze({
    scenarioId: input.scenarioId,
    ok: true,
    staticCodes: Object.freeze([input.scenarioId === "S3" ? "REPLAY_OBSERVED" : "CHANGED_REASON_OBSERVED"]),
    operationKey: request.operationKey,
    wireFingerprint: request.wireFingerprint,
    limitations: Object.freeze([]),
  });
}

function probeRequest(runId: string, scenarioId: "S3" | "S4", fixture: ProviderFixture) {
  const operationKey = deriveTossRefundOperationKey(`h1:${runId}:${scenarioId}`);
  const input = { paymentKey: fixture.paymentKey, providerOperationKey: operationKey, cancelAmount: fixture.amount };
  const wire = deriveTossRefundCancellationWireRequest(input);
  const { firstBody, secondBody } = probeCanonicalBodies(scenarioId, fixture.amount, wire);
  return Object.freeze({
    operationKey, wire, firstBody, secondBody,
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

function postProbe(
  budget: ProviderCallBudget,
  port: ProbePost,
  scenarioId: "S3" | "S4",
  wire: TossRefundCancellationWireRequest,
  body: string,
): Promise<TossRefundCancellationTransportResult> {
  return budget.invokeProtected(
    scenarioId,
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
  try { return JSON.parse(body); } catch { throw new Error("PROBE_ELIGIBILITY_MISMATCH"); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function changedReasonDiffersOnlyByReason(wire: TossRefundCancellationWireRequest): boolean {
  const first = wire.body;
  const second = { cancelReason: H1_CHANGED_CANCEL_REASON, cancelAmount: first.cancelAmount };
  return first.cancelReason === TOSS_REFUND_CANCEL_REASON
    && first.cancelAmount === second.cancelAmount
    && first.cancelReason !== second.cancelReason;
}
