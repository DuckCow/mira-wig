import type { AcceptanceBootstrapHandle } from "./bootstrap";
import type { RefundFixtureIds } from "./cleanup";
import type { H1Scenario } from "./contracts";
import type { BaseLedgerIntegrity } from "./integrity";
import { RunLedgerStore, type H1Ledger } from "./run-ledger";

export async function appendRuntimeLedger(
  store: RunLedgerStore,
  previous: H1Ledger | null,
  phase: H1Ledger["phase"],
  payload: Readonly<Record<string, unknown>>,
  integrity?: BaseLedgerIntegrity & Readonly<{ scenarioInputHash: string }>,
): Promise<H1Ledger> {
  const identity = previous ? ledgerIdentity(previous) : requireIntegrity(integrity);
  return store.append({
    runId: previous?.runId ?? inferRunId(store),
    scenarioId: previous?.scenarioId ?? inferScenario(payload.scenarioId),
    phase,
    repositoryCommit: identity.repositoryCommit,
    runnerSourceHash: identity.runnerSourceHash,
    policyHashes: identity.policyHashes,
    migrationFingerprint: identity.migrationFingerprint,
    scenarioInputHash: identity.scenarioInputHash,
    payload,
  });
}

function ledgerIdentity(ledger: H1Ledger) {
  return Object.freeze({
    repositoryCommit: ledger.repositoryCommit,
    runnerSourceHash: ledger.runnerSourceHash,
    policyHashes: ledger.policyHashes,
    migrationFingerprint: ledger.migrationFingerprint,
    scenarioInputHash: ledger.scenarioInputHash,
  });
}

export function acceptanceOperationEnv(env: Readonly<Record<string, string | undefined>>) {
  return Object.freeze({
    ...env,
    REFUND_EXECUTION_LEASE_ENABLED: "ENABLED",
    REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED: "ENABLED",
    REFUND_EXECUTION_TOSS_AUTHORIZATION_ENABLED: "ENABLED",
    REFUND_EXECUTION_TOSS_ELIGIBILITY_LOOKUP_ENABLED: "ENABLED",
    REFUND_EXECUTION_TOSS_CONTACT_ENABLED: "ENABLED",
    REFUND_EXECUTION_TOSS_RECOVERY_LOOKUP_ENABLED: "ENABLED",
    REFUND_EXECUTION_TOSS_RECOVERY_RECONTACT_ENABLED: "ENABLED",
    REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED: "ENABLED",
  });
}

export function parseProtectedOwnership(ledger: H1Ledger | null): Readonly<{
  handle: AcceptanceBootstrapHandle;
  refund: RefundFixtureIds | null;
}> {
  if (!ledger) throw new Error("CLEANUP_LEDGER_REQUIRED");
  const handle = ledger.payload.bootstrapHandle;
  const refund = ledger.payload.refundFixture;
  if (!isBootstrapHandle(handle)) throw new Error("CLEANUP_LEDGER_INVALID");
  return Object.freeze({ handle, refund: isRefundFixture(refund) ? refund : null });
}

export function protectedOwnershipOrNull(ledger: H1Ledger) {
  try {
    return parseProtectedOwnership(ledger);
  } catch {
    return null;
  }
}

function inferRunId(store: RunLedgerStore): string {
  const match = store.directory.match(/(sbx-\d{8}T\d{6}Z-[0-9a-f]{16})/);
  if (!match?.[1]) throw new Error("LEDGER_RUN_ID_UNAVAILABLE");
  return match[1];
}

function inferScenario(value: unknown): H1Scenario {
  if (value === "S1" || value === "S2" || value === "S3"
    || value === "S4" || value === "S5" || value === "S6") return value;
  throw new Error("LEDGER_SCENARIO_UNAVAILABLE");
}

function requireIntegrity(
  value: BaseLedgerIntegrity & Readonly<{ scenarioInputHash: string }> | undefined,
) {
  if (!value) throw new Error("LEDGER_INTEGRITY_REQUIRED");
  return value;
}

function isBootstrapHandle(value: unknown): value is AcceptanceBootstrapHandle {
  return typeof value === "object" && value !== null && "runId" in value && "orderId" in value
    && "paymentId" in value && "userId" in value && "checkoutSessionId" in value;
}

function isRefundFixture(value: unknown): value is RefundFixtureIds {
  return typeof value === "object" && value !== null && "refundAttemptId" in value && "commandId" in value;
}
