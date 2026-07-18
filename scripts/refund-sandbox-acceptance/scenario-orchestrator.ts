import { createHash } from "node:crypto";
import {
  RefundAttemptActorType,
  type PrismaClient,
} from "@prisma/client";
import { requestRefundAttempt } from "../../src/lib/payment/refund/request";
import { claimRefundAttemptForExecution } from "../../src/lib/payment/refund/claim";
import { acquireRefundExecutionLease } from "../../src/lib/payment/refund/acquire-lease";
import { createTossRefundExecutionAuthorizer } from "../../src/lib/payment/refund/providers/toss/refund-authorization-orchestrator";
import { createTossRefundContactExecutor } from "../../src/lib/payment/refund/providers/toss/refund-contact-orchestrator";
import { createTossRefundRecoveryOperation } from "../../src/lib/payment/refund/providers/toss/refund-recovery-orchestrator";
import type { TossRefundLookupPort } from "../../src/lib/payment/refund/providers/toss/refund-lookup-http";
import type {
  TossRefundCancellationPort,
  TossRefundCancellationTransportResult,
} from "../../src/lib/payment/refund/providers/toss/refund-cancellation-http";
import { AcceptanceBootstrap, type AcceptanceBootstrapHandle } from "./bootstrap";
import { ProviderCallBudget } from "./call-budget";
import type { H1Scenario } from "./contracts";
import type { ProviderFixture } from "./fixture-manifest";
import type { H1LedgerPhase } from "./run-ledger";
import { executeProviderProbe, type ProbePost } from "./scenario-probes";

export const S2_LIMITATION = "This simulates a provider response received by the process but lost before durable application. It is not a TCP-level response-loss simulation.";
export const S5_LIMITATION = "This proves the application ordinal-2 recontact path. The provider observes only one cancellation POST in S5. Provider duplicate-POST behavior is tested by S3.";

export type ScenarioDependencies = Readonly<{
  client: PrismaClient;
  bootstrap: AcceptanceBootstrap;
  lookup: TossRefundLookupPort;
  cancellation: TossRefundCancellationPort;
  probePost: ProbePost;
  budget: ProviderCallBudget;
  env: Readonly<Record<string, string | undefined>>;
  probeAuthorization: string;
  recordDiscardedResponse?: (result: TossRefundCancellationTransportResult) => Promise<void>;
  recordCrashAdjustment?: (projection: Readonly<Record<string, string | number | null>>) => Promise<void>;
  recordLocalOwnership?: (ownership: Readonly<{
    bootstrapHandle: AcceptanceBootstrapHandle;
    refundFixture: Readonly<{ refundAttemptId: string; commandId: string }>;
  }>) => Promise<void>;
  priorBootstrapHandle?: AcceptanceBootstrapHandle;
  now?: () => Date;
}>;

export type ScenarioResult = Readonly<{
  scenarioId: H1Scenario;
  ok: boolean;
  staticCodes: readonly string[];
  operationKey: string | null;
  wireFingerprint: string | null;
  limitations: readonly string[];
}>;

export async function executeScenario(
  dependencies: ScenarioDependencies,
  input: Readonly<{
    runId: string;
    scenarioId: H1Scenario;
    fixture: ProviderFixture;
    ledgerPhase: H1LedgerPhase;
  }>,
): Promise<ScenarioResult> {
  if (input.fixture.scenarioId !== input.scenarioId) throw new Error("SCENARIO_FIXTURE_MISMATCH");
  if (input.scenarioId === "S3" || input.scenarioId === "S4") {
    return executeProviderProbe(dependencies, Object.freeze({
      runId: input.runId,
      scenarioId: input.scenarioId,
      fixture: input.fixture,
    }));
  }
  if (input.scenarioId === "S6") return executeS6(dependencies, input);
  const local = await prepareLocalAggregate(dependencies, input);
  if (input.scenarioId === "S1") return executeS1(dependencies, input, local);
  if (input.scenarioId === "S2") return executeS2(dependencies, input, local);
  return executeS5(dependencies, input, local);
}

type LocalAggregate = Readonly<{
  bootstrap: AcceptanceBootstrapHandle;
  refundAttemptId: string;
  commandId: string;
  leaseGeneration: number;
  leaseToken: string;
}>;

async function prepareLocalAggregate(
  dependencies: ScenarioDependencies,
  input: Readonly<{ runId: string; scenarioId: H1Scenario; fixture: ProviderFixture; ledgerPhase: H1LedgerPhase }>,
): Promise<LocalAggregate> {
  const now = dependencies.now?.() ?? new Date();
  const bootstrapped = await dependencies.bootstrap.createOrLoad({
    ...input,
    priorHandle: dependencies.priorBootstrapHandle,
    now,
  });
  const refundAttemptId = `h1_refund_${identityDigest(input.runId, input.scenarioId)}`;
  const requested = await requestRefundAttempt(dependencies.client, {
    refundAttemptId,
    orderId: bootstrapped.handle.orderId,
    amount: input.fixture.amount,
    reason: "H1 manual Toss SANDBOX acceptance",
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: `h1_actor_${identityDigest(input.runId, input.scenarioId)}`,
    now,
  });
  if (!requested.ok) throw new Error(`REQUEST_FAILED_${requested.code}`);
  const claimed = await claimRefundAttemptForExecution(dependencies.client, {
    orderId: bootstrapped.handle.orderId,
    refundAttemptId,
    actorType: RefundAttemptActorType.ADMIN,
    actorUserId: `h1_actor_${identityDigest(input.runId, input.scenarioId)}`,
    now,
  });
  if (!claimed.ok) throw new Error(`CLAIM_FAILED_${claimed.code}`);
  const leased = await acquireRefundExecutionLease(dependencies.client, {
    commandId: claimed.commandId,
    leaseOwner: `h1-${input.runId}-${input.scenarioId}`,
  }, dependencies.env);
  if (!leased.ok) throw new Error(`LEASE_FAILED_${leased.code}`);
  await dependencies.recordLocalOwnership?.(Object.freeze({
    bootstrapHandle: bootstrapped.handle,
    refundFixture: Object.freeze({ refundAttemptId, commandId: claimed.commandId }),
  }));
  return Object.freeze({
    bootstrap: bootstrapped.handle,
    refundAttemptId,
    commandId: claimed.commandId,
    leaseGeneration: leased.lease.leaseGeneration,
    leaseToken: leased.lease.leaseToken,
  });
}

async function executeS1(
  dependencies: ScenarioDependencies,
  input: Readonly<{ scenarioId: "S1"; fixture: ProviderFixture }> | Readonly<{ scenarioId: H1Scenario; fixture: ProviderFixture }>,
  local: LocalAggregate,
): Promise<ScenarioResult> {
  const lookup = dependencies.budget.wrapLookup("S1", dependencies.lookup);
  const cancellation = dependencies.budget.wrapCancellation("S1", dependencies.cancellation);
  const operationInput = leaseInput(local);
  const authorization = await createTossRefundExecutionAuthorizer({ lookup })(dependencies.client, operationInput, dependencies.env);
  if (!authorization.ok) throw new Error(`AUTHORIZATION_FAILED_${authorization.code}`);
  const contact = await createTossRefundContactExecutor({ lookup, cancellation })(dependencies.client, operationInput, dependencies.env);
  const identity = await loadWireIdentity(dependencies.client, local.refundAttemptId);
  return scenarioResult("S1", contact.ok, contact.ok ? ["SUCCEEDED"] : [contact.code], identity, []);
}

async function executeS2(
  dependencies: ScenarioDependencies,
  input: Readonly<{ scenarioId: H1Scenario; fixture: ProviderFixture }>,
  local: LocalAggregate,
): Promise<ScenarioResult> {
  const lookup = dependencies.budget.wrapLookup("S2", dependencies.lookup);
  const underlying = dependencies.budget.wrapCancellation("S2", dependencies.cancellation);
  const discard: TossRefundCancellationPort = async (contact) => {
    const providerResult = await underlying(contact);
    await dependencies.recordDiscardedResponse?.(providerResult);
    return Object.freeze({ kind: "unknown" });
  };
  const operationInput = leaseInput(local);
  const authorization = await createTossRefundExecutionAuthorizer({ lookup })(dependencies.client, operationInput, dependencies.env);
  if (!authorization.ok) throw new Error(`AUTHORIZATION_FAILED_${authorization.code}`);
  const contact = await createTossRefundContactExecutor({ lookup, cancellation: discard })(dependencies.client, operationInput, dependencies.env);
  if (contact.ok || contact.code !== "TOSS_CONTACT_OUTCOME_UNKNOWN") throw new Error("S2_DISCARD_FAILED");
  await expireForRecovery(dependencies, local.commandId, false);
  const recovered = await createTossRefundRecoveryOperation({ lookup })(dependencies.client, {
    commandId: local.commandId,
    recoveryOwner: `h1-recovery-${input.fixture.scenarioId}`,
  }, dependencies.env);
  const identity = await loadWireIdentity(dependencies.client, local.refundAttemptId);
  return scenarioResult("S2", recovered.ok, recovered.ok ? ["RECOVERED"] : [recovered.code], identity, [S2_LIMITATION]);
}

async function executeS5(
  dependencies: ScenarioDependencies,
  input: Readonly<{ scenarioId: H1Scenario; fixture: ProviderFixture }>,
  local: LocalAggregate,
): Promise<ScenarioResult> {
  const lookup = dependencies.budget.wrapLookup("S5", dependencies.lookup);
  const noDial: TossRefundCancellationPort = () => Promise.resolve(Object.freeze({ kind: "unknown" }));
  const operationInput = leaseInput(local);
  const authorization = await createTossRefundExecutionAuthorizer({ lookup })(dependencies.client, operationInput, dependencies.env);
  if (!authorization.ok) throw new Error(`AUTHORIZATION_FAILED_${authorization.code}`);
  const contact = await createTossRefundContactExecutor({ lookup, cancellation: noDial })(dependencies.client, operationInput, dependencies.env);
  if (contact.ok || contact.code !== "TOSS_CONTACT_OUTCOME_UNKNOWN") throw new Error("S5_SUPPRESSION_FAILED");
  await expireForRecovery(dependencies, local.commandId, true);
  const cancellation = dependencies.budget.wrapCancellation("S5", dependencies.cancellation);
  const recovered = await createTossRefundRecoveryOperation({ lookup, cancellation })(dependencies.client, {
    commandId: local.commandId,
    recoveryOwner: `h1-recovery-${input.fixture.scenarioId}`,
  }, dependencies.env);
  const identity = await loadWireIdentity(dependencies.client, local.refundAttemptId);
  return scenarioResult("S5", recovered.ok, recovered.ok ? ["ORDINAL_2_SUCCEEDED"] : [recovered.code], identity, [S5_LIMITATION]);
}

async function executeS6(
  dependencies: ScenarioDependencies,
  input: Readonly<{ runId: string; scenarioId: H1Scenario; fixture: ProviderFixture; ledgerPhase: H1LedgerPhase }>,
): Promise<ScenarioResult> {
  if (input.ledgerPhase === "PLANNED") {
    return scenarioResult("S6", true, ["SKIPPED_NOT_AVAILABLE"], null, []);
  }
  const local = await prepareLocalAggregate(dependencies, input);
  const lookup = dependencies.budget.wrapLookup("S6", dependencies.lookup);
  const noDial: TossRefundCancellationPort = () => Promise.resolve(Object.freeze({ kind: "unknown" }));
  const operationInput = leaseInput(local);
  const authorization = await createTossRefundExecutionAuthorizer({ lookup })(dependencies.client, operationInput, dependencies.env);
  if (!authorization.ok) throw new Error(`AUTHORIZATION_FAILED_${authorization.code}`);
  const contact = await createTossRefundContactExecutor({ lookup, cancellation: noDial })(dependencies.client, operationInput, dependencies.env);
  return scenarioResult("S6", !contact.ok && contact.code === "TOSS_CONTACT_OUTCOME_UNKNOWN", ["S6_PREPARED"], await loadWireIdentity(dependencies.client, local.refundAttemptId), []);
}

async function expireForRecovery(
  dependencies: ScenarioDependencies,
  commandId: string,
  includeContactInterval: boolean,
): Promise<void> {
  const before = await dependencies.client.refundExecutionCommand.findUniqueOrThrow({ where: { id: commandId }, select: { leaseUntil: true } });
  const now = dependencies.now?.() ?? new Date();
  const leaseUntil = new Date(now.getTime() - 1_000);
  await dependencies.client.refundExecutionCommand.update({ where: { id: commandId }, data: { leaseUntil } });
  if (includeContactInterval) {
    await dependencies.client.refundExecutionDispatchAttempt.updateMany({
      where: { commandId, ordinal: 1 },
      data: {
        authorizedAt: new Date(now.getTime() - 16 * 60_000),
        contactMarkedAt: new Date(now.getTime() - 16 * 60_000),
      },
    });
  }
  await dependencies.recordCrashAdjustment?.(Object.freeze({
    beforeLeaseUntilMs: before.leaseUntil?.getTime() ?? null,
    afterLeaseUntilMs: leaseUntil.getTime(),
    contactIntervalBackdated: includeContactInterval ? 1 : 0,
  }));
}

async function loadWireIdentity(client: PrismaClient, refundAttemptId: string) {
  const binding = await client.refundExecutionProviderOperationBinding.findUniqueOrThrow({
    where: { refundAttemptId },
    select: { providerOperationKey: true, wireRequestFingerprint: true },
  });
  return Object.freeze({ operationKey: binding.providerOperationKey, wireFingerprint: binding.wireRequestFingerprint });
}

function scenarioResult(
  scenarioId: H1Scenario,
  ok: boolean,
  staticCodes: readonly string[],
  identity: Readonly<{ operationKey: string; wireFingerprint: string }> | null,
  limitations: readonly string[],
): ScenarioResult {
  return Object.freeze({
    scenarioId, ok, staticCodes: Object.freeze([...staticCodes]),
    operationKey: identity?.operationKey ?? null,
    wireFingerprint: identity?.wireFingerprint ?? null,
    limitations: Object.freeze([...limitations]),
  });
}

function identityDigest(runId: string, scenarioId: H1Scenario): string {
  return createHash("sha256").update(`${runId}:${scenarioId}`).digest("hex").slice(0, 24);
}

function leaseInput(local: LocalAggregate) {
  return Object.freeze({
    commandId: local.commandId,
    leaseGeneration: local.leaseGeneration,
    leaseToken: local.leaseToken,
  });
}
