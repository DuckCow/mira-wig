import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { acquireRefundExecutionLease } from "../../../acquire-lease";
import {
  cleanupDispatchFixtures, createDispatchFixture, type DispatchFixture,
} from "../../../__tests__/refund-dispatch-fixture";
import { runEximbayRefundReentryOnce } from "../../../run-eximbay-refund-reentry-once";
import {
  defaultRefundWorkerContainerSupervisorDependencies,
  runRefundWorkerContainerSupervisor,
} from "../../../refund-worker-container-supervisor";
import { createEximbayFirstRefundDispatchAuthorizer } from "../authorize-first-dispatch";
import type { EximbayPreflightDiagnostic } from "../preflight-diagnostic";

const CONFIG = Object.freeze({
  mode: "SANDBOX", mid: "synthetic-merchant-mid",
  merchantAccountBindingId: "merchant-test-1", credentialGenerationBindingId: "generation-test-1",
} as const);
const SENTINEL = "sensitive-diagnostic-test-sentinel";
const INSTANCE = "sample-project:asia-northeast3:refund-db";
const ENV = Object.freeze({
  REFUND_EXECUTION_WORKER_ENABLED: "ENABLED",
  REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED: "ENABLED",
  REFUND_EXECUTION_LEASE_ENABLED: "ENABLED",
  REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED: "ENABLED",
  REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED: "ENABLED",
  REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED: "ENABLED",
  MIRA_REFUND_AUTHORIZATION_ENABLED: "ENABLED",
  MIRA_REFUND_AUTHORIZATION_ID: "synthetic-grant",
  MIRA_REFUND_REENTRY_ADMISSION_URL: "https://sample.invalid/api/payments/refunds/reentry/admission",
  MIRA_REFUND_REENTRY_JOB_NAME: "projects/sample-project/locations/asia-northeast3/jobs/refund-worker",
  CLOUD_RUN_JOB: "mira-eximbay-refund-canary", CLOUD_RUN_EXECUTION: "synthetic-execution",
  CLOUD_RUN_TASK_COUNT: "1", CLOUD_RUN_TASK_INDEX: "0", CLOUD_RUN_TASK_ATTEMPT: "0",
  REFUND_CLOUD_SQL_INSTANCE_CONNECTION_NAME: INSTANCE,
  // Only the fake supervisor receives this URL; db uses the disposable DATABASE_URL.
  DATABASE_URL: `postgresql://refund_role:${SENTINEL}@localhost:5432/refund_sandbox?host=/cloudsql/${INSTANCE}`,
});

type Scenario = "transport" | "read" | "json" | "identity" | "money" | "status"
  | "observation" | "dispatch" | "reused-dispatch";
const SCENARIOS: readonly Scenario[] = [
  "transport", "read", "json", "identity", "money", "status", "observation", "dispatch", "reused-dispatch",
];

describe("real Eximbay preflight diagnostic propagation", () => {
  const fixtures: DispatchFixture[] = [];

  beforeAll(async () => {
    const rows = await db.$queryRaw<{ name: string; directory: string }[]>`
      SELECT current_database() AS name, current_setting('data_directory') AS directory
    `;
    expect(rows).toEqual([{
      name: "wig_platform_test", directory: process.env.MIRA_REFUND_AUTHORIZATION_TEST_CLUSTER,
    }]);
  });

  afterEach(async () => {
    // Same immutable-observation cleanup owner pattern as cancel-recovery integration.
    const bindings = await db.refundExecutionProviderOperationBinding.findMany({
      where: { refundAttemptId: { in: fixtures.map((fixture) => fixture.refundAttemptId) } },
      select: { id: true },
    });
    await db.$executeRawUnsafe('ALTER TABLE "RefundExecutionEximbayPreflightObservation" DISABLE TRIGGER "EximbayPreflight_immutable"');
    try {
      await db.refundExecutionEximbayPreflightObservation.deleteMany({
        where: { bindingId: { in: bindings.map((binding) => binding.id) } },
      });
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE "RefundExecutionEximbayPreflightObservation" ENABLE TRIGGER "EximbayPreflight_immutable"');
    }
    await cleanupDispatchFixtures(...fixtures);
    fixtures.length = 0;
  });

  it.each(SCENARIOS)("preserves durable state and exact effects through %s failure", async (scenario) => {
    const { fixture, providerOrderId, lease } = await readyCandidate(fixtures);
    const faultTable = faultTableFor(scenario);
    if (faultTable) await installFault(faultTable);
    try {
      if (scenario === "reused-dispatch") {
        let seedRetrieveCount = 0;
        const seeded = await createEximbayFirstRefundDispatchAuthorizer({
          config: CONFIG,
          retrieve: () => { seedRetrieveCount += 1; return Promise.resolve(responseFor("dispatch", fixture, providerOrderId)); },
        })(db, { commandId: lease.commandId, leaseGeneration: lease.leaseGeneration, leaseToken: lease.leaseToken });
        expect(seeded).toMatchObject({ ok: false, code: "PERSISTENCE_CONFLICT" });
        expect(seedRetrieveCount).toBe(1);
      }
      const before = await financialState(fixture);
      expect(before.command.status).toBe("LEASED");
      expect(before.attempt.status).toBe("PROCESSING");
      expect(before.order.status).toBe("REFUND_PENDING");
      expect(before.dispatches).toEqual([]);
      expect(before.evidence).toEqual([]);
      expect(before.outbox).toEqual([]);
      const calls: string[] = [];
      const result = await runEximbayRefundReentryOnce(ENV, {
        createDatabase: () => db,
        disconnectDatabase: () => Promise.resolve(),
        admit: () => Promise.resolve({
          grantId: "synthetic-grant", releasePolicyDigest: "a".repeat(64), lease,
          account: { ...CONFIG, secretResource: SENTINEL, secretVersion: "1" },
        }),
        readSecret: () => Promise.resolve(SENTINEL),
        fetch: (input) => {
          calls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
          if (scenario === "transport") return Promise.reject(new Error(SENTINEL));
          return Promise.resolve(responseFor(scenario, fixture, providerOrderId));
        },
        runAdmission: async (_env, operation) => ({ outcome: "ACQUIRED", result: await operation() }),
      });
      const retrieveCount = scenario === "reused-dispatch" ? 0 : 1;
      expect(calls).toHaveLength(retrieveCount);
      for (const url of calls) expect(url).toBe("https://api-test.eximbay.com/v1/payments/retrieve");
      expect(result).toMatchObject({
        ok: false, preflightRetrieveCount: retrieveCount, cancellationCount: 0, reconciliationLookupCount: 0,
        terminalClass: retrieveCount ? "PROVIDER_EFFECT_POSSIBLE" : "SAFE_STOP", reentry: "FORBIDDEN",
        diagnostic: expectedDiagnostic(scenario), cleanupFailures: [],
      });
      expect(await financialState(fixture)).toEqual(before);
      const observations = await db.refundExecutionEximbayPreflightObservation.findMany({
        where: { binding: { refundAttemptId: fixture.refundAttemptId } },
      });
      expect(observations).toHaveLength(faultTable === "RefundExecutionDispatchAttempt" ? 1 : 0);
      // Same serialization as the installed CLI, through the real supervisor parser/validator.
      const terminal = `${JSON.stringify(result)}\n`;
      const supervised = await supervise(terminal);
      expect(supervised.value).toMatchObject({ childOperationResult: {
        evidence: "TRUSTWORTHY", result,
        providerEffects: { preflightRetrieveCount: retrieveCount, cancellationCount: 0, reconciliationLookupCount: 0 },
      } });
      expect(supervised.spawnCount).toBe(2); // proxy plus one child, no retry/reconciliation job
      const output = terminal + supervised.output;
      for (const forbidden of [SENTINEL, providerOrderId, fixture.providerPaymentKey, fixture.userId, "Authorization", "Bearer", "resmsg", "transaction_id"]) {
        expect(output).not.toContain(forbidden);
      }
    } finally {
      if (faultTable) await removeFault(faultTable);
    }
  });
});

function faultTableFor(scenario: Scenario): string | null {
  if (scenario === "observation") return "RefundExecutionEximbayPreflightObservation";
  if (scenario === "dispatch" || scenario === "reused-dispatch") return "RefundExecutionDispatchAttempt";
  return null;
}

async function readyCandidate(fixtures: DispatchFixture[]) {
  const fixture = await createDispatchFixture({
    totalAmount: 1_234, targetAmount: 1_234, communicationLocale: "en",
  });
  fixtures.push(fixture);
  await db.$executeRawUnsafe('ALTER TABLE "Payment" DISABLE TRIGGER "Payment_provider_order_id_immutable"');
  try {
    await db.payment.update({ where: { id: fixture.paymentId }, data: {
      currency: "USD", provider: "EXIMBAY", mode: "SANDBOX", providerOrderId: syntheticEximbayProviderOrderId(),
    } });
  } finally {
    await db.$executeRawUnsafe('ALTER TABLE "Payment" ENABLE TRIGGER "Payment_provider_order_id_immutable"');
  }
  const payment = await db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } });
  await db.order.update({ where: { id: fixture.orderId }, data: { currency: "USD" } });
  await db.refundAttempt.update({ where: { id: fixture.refundAttemptId }, data: { currency: "USD", provider: "EXIMBAY", mode: "SANDBOX" } });
  if (!payment.providerOrderId) throw new Error("Missing synthetic provider order id");
  const providerOrderId = payment.providerOrderId;
  const acquired = await acquireRefundExecutionLease(db, {
    commandId: fixture.commandId, leaseOwner: "diagnostic-test",
  }, ENV);
  if (!acquired.ok) throw new Error(acquired.code);
  return { fixture, providerOrderId, lease: acquired.lease };
}

async function financialState(fixture: DispatchFixture) {
  return {
    command: await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: fixture.commandId } }),
    attempt: await db.refundAttempt.findUniqueOrThrow({ where: { id: fixture.refundAttemptId } }),
    order: await db.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
    dispatches: await db.refundExecutionDispatchAttempt.findMany({ where: { commandId: fixture.commandId } }),
    evidence: await db.refundExecutionEvidence.findMany({ where: { commandId: fixture.commandId } }),
    transitions: await db.refundAttemptTransition.findMany({ where: { refundAttemptId: fixture.refundAttemptId }, orderBy: { id: "asc" } }),
    outbox: await db.paymentOutbox.findMany({ where: { dedupKey: { contains: fixture.refundAttemptId } } }),
  };
}

async function installFault(table: string) {
  await db.$executeRawUnsafe(`CREATE FUNCTION diagnostic_test_fail() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '${SENTINEL}'; END $$`);
  try {
    await db.$executeRawUnsafe(`CREATE CONSTRAINT TRIGGER diagnostic_test_fail
      AFTER INSERT ON "${table}" DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION diagnostic_test_fail()`);
  } catch (error) {
    await db.$executeRawUnsafe('DROP FUNCTION diagnostic_test_fail()');
    throw error;
  }
}

async function removeFault(table: string) {
  await db.$executeRawUnsafe(`DROP TRIGGER diagnostic_test_fail ON "${table}"`);
  await db.$executeRawUnsafe('DROP FUNCTION diagnostic_test_fail()');
}

function responseFor(scenario: Scenario, fixture: DispatchFixture, providerOrderId: string): Response {
  if (scenario === "read") return new Response(new ReadableStream<Uint8Array>({
    pull(controller) { controller.error(new Error(SENTINEL)); },
  }), { headers: { "content-type": "application/json" } });
  if (scenario === "json") return new Response(`{${SENTINEL}`, { headers: { "content-type": "application/json" } });
  return Response.json({
    rescode: "0000", resmsg: SENTINEL, mid: CONFIG.mid,
    payment: {
      order_id: scenario === "identity" ? "wrong-identity" : providerOrderId,
      currency: "USD", amount: scenario === "money" ? "12.35" : "12.34",
      transaction_id: fixture.providerPaymentKey,
      status: scenario === "status" ? "VOID" : "SALE", transaction_date: "20260821112233", balance: "12.34",
    },
  });
}

function expectedDiagnostic(scenario: Scenario): EximbayPreflightDiagnostic {
  if (scenario === "observation") return {
    stage: "OBSERVATION_TRANSACTION", kind: "EXCEPTION", code: null, responseReceived: true, httpStatus: null,
  };
  if (scenario === "dispatch" || scenario === "reused-dispatch") return {
    stage: "DISPATCH_AUTHORIZATION", kind: "EXCEPTION", code: "PERSISTENCE_CONFLICT",
    responseReceived: scenario === "dispatch" ? true : null, httpStatus: null,
  };
  const codes = { transport: "TRANSPORT_FAILURE", read: "TRANSPORT_FAILURE", json: "INVALID_JSON",
    identity: "IDENTITY_MISMATCH", money: "MONEY_MISMATCH", status: "UNSUPPORTED_STATUS" } as const;
  return { stage: "RETRIEVE", kind: scenario === "transport" || scenario === "read" ? "EXCEPTION" : "REJECTION",
    code: codes[scenario], responseReceived: scenario !== "transport", httpStatus: scenario === "transport" ? null : 200 };
}

// Existing supervisor fake-child pattern; only process/transport boundaries are faked.
class TerminalChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  close(code: number) { this.exitCode = code; this.emit("close", code, null); }
  kill() { queueMicrotask(() => this.close(0)); return true; }
}

async function supervise(terminal: string) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let spawnCount = 0;
  await runRefundWorkerContainerSupervisor(["eximbay-refund-reentry-once"], ENV, {
    stdout: { write: (line) => stdout.push(line) }, stderr: { write: (line) => stderr.push(line) },
  }, {
    ...defaultRefundWorkerContainerSupervisorDependencies,
    spawn: () => {
      const child = new TerminalChild();
      spawnCount += 1;
      if (spawnCount === 2) queueMicrotask(() => { child.stdout.write(terminal); child.close(1); });
      if (spawnCount > 2) throw new Error("Unexpected extra child");
      return child;
    },
    fetch: () => Promise.resolve({ ok: true }),
    inspectSelf: () => Promise.reject(new Error("Unused external inspection")),
  });
  expect(stdout).toHaveLength(1);
  const value: unknown = JSON.parse(stdout[0] ?? "null");
  return { value, output: stdout.join("") + stderr.join(""), spawnCount };
}
