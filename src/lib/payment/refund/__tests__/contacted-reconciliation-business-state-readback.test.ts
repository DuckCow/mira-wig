import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CheckoutSessionStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentEventSource,
  PaymentEventStatus,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_CODE,
  CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_MODE,
  CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_ROLE,
  READBACK_SQL,
  readContactedReconciliationBusinessState,
  type FixedReadbackQuery,
} from "../../../../../containers/refund-db-bootstrap/contacted-reconciliation-business-state-readback";
import {
  runDatabaseBootstrapEntrypoint,
  type RuntimeDependencies,
} from "../../../../../containers/refund-db-bootstrap/entrypoint";

const ROOT = process.cwd();
const RUN_ID = "a764f61f4e4ba799ab16b318a676db65";
const SESSION_ID = "cmthg2mzu000001s6iuvx7u5x";
const EXECUTION = "mira-p3e-sbx-contacted-reconciliation-vnnsq";
const EXECUTION_UID = "87d659b0-a6a3-4353-9678-c18f629df434";
const CAPTURED_AT = new Date("2026-09-01T07:00:00.000Z");
const OBSERVED_AT = new Date("2026-09-01T06:47:30.500Z");

describe("fixed CONTACTED reconciliation business-state readback", () => {
  it("adjudicates one exact Q004 release and remains provider/write free", async () => {
    const fixture = releasedFixture();
    const { query, calls } = queryFixture(fixture);
    const result = await readContactedReconciliationBusinessState(query);

    expect(result).toMatchObject({
      ok: true,
      code: CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_CODE,
      runId: RUN_ID,
      checkoutSessionId: SESSION_ID,
      databaseUser: CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_ROLE,
      transactionReadOnly: true,
      providerEffects: 0,
      businessRowMutations: 0,
      paymentCount: 1,
      relevantPaymentCount: 1,
      selectedCandidate: { paymentId: "payment-contacted", kind: "REPLAY" },
      q004ObservedEventCount: 1,
      orderCount: 0,
      q004ReleaseDurable: "YES",
      contactedBlocker: "RELEASED",
      freshSaleEligible: "YES",
    });
    expect(result.q004Events).toEqual([
      expect.objectContaining({
        paymentId: "payment-contacted",
        type: "EXIMBAY_NO_TRANSACTION_OBSERVED",
        exactQ004RecoveryEvidence: true,
        evidencePayloadWithinBound: true,
        credentialBindingPresent: true,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("credential-binding-exact");
    expect(calls[0]?.sql).toBe(READBACK_SQL.begin);
    expect(calls.at(-1)?.sql).toBe(READBACK_SQL.commit);
    expect(calls.every(({ sql }) => !/\b(?:INSERT|UPDATE|DELETE|UPSERT|ALTER|CREATE|DROP|TRUNCATE)\b/u
      .test(sql))).toBe(true);
    expect(calls.every(({ sql }) => !/\bFOR\s+(?:UPDATE|NO\s+KEY\s+UPDATE|SHARE|KEY\s+SHARE)\b/u
      .test(sql))).toBe(true);
  });

  it("reports the exact CONTACTED blocker as preserved when no Q004 event exists", async () => {
    const { query } = queryFixture({
      ...releasedFixture(),
      payments: [activePayment()],
      events: [],
    });
    const result = await readContactedReconciliationBusinessState(query);
    expect(result).toMatchObject({
      q004ReleaseDurable: "NO",
      contactedBlocker: "PRESERVED",
      freshSaleEligible: "NOT_YET",
      selectedCandidate: { paymentId: "payment-contacted", kind: "ACTIVE" },
    });
  });

  it("fails closed on split or incomplete durable evidence", async () => {
    const { query } = queryFixture({ ...releasedFixture(), events: [] });
    const result = await readContactedReconciliationBusinessState(query);
    expect(result).toMatchObject({
      q004ReleaseDurable: "AMBIGUOUS",
      contactedBlocker: "AMBIGUOUS",
      freshSaleEligible: "NOT_YET",
    });
  });

  it("fails closed without materializing an oversized event payload", async () => {
    const { query } = queryFixture({
      ...releasedFixture(),
      events: [{ ...q004Event(), rawWithinBound: false, raw: null }],
    });
    const result = await readContactedReconciliationBusinessState(query);
    expect(result.q004Events[0]).toMatchObject({
      evidencePayloadWithinBound: false,
      exactQ004RecoveryEvidence: false,
    });
    expect(result).toMatchObject({
      q004ReleaseDurable: "AMBIGUOUS",
      contactedBlocker: "AMBIGUOUS",
      freshSaleEligible: "NOT_YET",
    });
  });

  it("uses the installed deterministic candidate semantics for multiple Payments", async () => {
    const second = { ...activePayment(), id: "payment-contacted-second" };
    const { query } = queryFixture({
      ...releasedFixture(),
      payments: [activePayment(), second],
      events: [],
    });
    const result = await readContactedReconciliationBusinessState(query);
    expect(result.paymentCount).toBe(2);
    expect(result.relevantPaymentCount).toBe(2);
    expect(result.selectedCandidate).toBeNull();
    expect(result.q004ReleaseDurable).toBe("AMBIGUOUS");
    expect(result.freshSaleEligible).toBe("NOT_YET");
  });

  it("correlates only the exact PaymentEvent and returns safe Order state", async () => {
    const malformed = {
      ...q004Event(),
      transmissionId: "eximbay:checkout-recovery:q004:another-payment",
    };
    const { query } = queryFixture({
      ...releasedFixture(),
      events: [malformed],
      orders: [orderRow()],
    });
    const result = await readContactedReconciliationBusinessState(query);
    expect(result.q004Events[0]).toMatchObject({
      paymentId: "another-payment",
      exactQ004RecoveryEvidence: false,
    });
    expect(result.orders).toEqual([expect.objectContaining({
      id: "order-existing",
      paymentId: "payment-contacted",
      status: "PAID",
    })]);
    expect(result.q004ReleaseDurable).toBe("AMBIGUOUS");
    expect(result.freshSaleEligible).toBe("NOT_YET");
  });

  it("admits only the exact readback Job, target, and one command", async () => {
    const configurations: Parameters<RuntimeDependencies["execute"]>[0][] = [];
    const execute: RuntimeDependencies["execute"] = (configuration) => {
      configurations.push(configuration);
      return Promise.resolve(Object.freeze({
      code: CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_CODE,
      providerEffects: 0,
      businessRowMutations: 0,
      }));
    };
    const output = outputSink();
    const result = await runDatabaseBootstrapEntrypoint(
      [CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_MODE],
      readbackEnvironment(),
      output,
      runtimeDependencies(execute),
    );
    expect(result).toBe(0);
    expect(configurations).toHaveLength(1);
    expect(configurations[0]?.mode).toBe(CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_MODE);
    expect(configurations[0]?.databaseUrl).toContain(encodeURIComponent(
      CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_ROLE,
    ));
    expect(output.stdoutLines).toHaveLength(1);

    for (const mutation of [
      { MIRA_CONTACTED_RECONCILIATION_READBACK_RUN_ID: "arbitrary" },
      { MIRA_CONTACTED_RECONCILIATION_READBACK_CHECKOUT_SESSION_ID: "arbitrary" },
      { CLOUD_RUN_JOB: "mira-p3e-sbx-refund-db-bootstrap" },
      { CLOUD_RUN_TASK_ATTEMPT: "1" },
    ]) {
      let executionCount = 0;
      const rejected: RuntimeDependencies["execute"] = () => {
        executionCount += 1;
        return Promise.resolve(Object.freeze({}));
      };
      expect(await runDatabaseBootstrapEntrypoint(
        [CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_MODE],
        { ...readbackEnvironment(), ...mutation },
        outputSink(),
        runtimeDependencies(rejected),
      )).toBe(64);
      expect(executionCount).toBe(0);
    }
  });

  it("contains no provider, secret, generic-query, or mutating SQL surface", () => {
    const source = readFileSync(join(
      ROOT,
      "containers/refund-db-bootstrap/contacted-reconciliation-business-state-readback.ts",
    ), "utf8");
    const sql = Object.values(READBACK_SQL).join("\n");
    expect(source).not.toMatch(/\bfetch\s*\(|SecretManager|EXIMBAY_(?:SANDBOX|LIVE)_API_KEY/u);
    expect(source).not.toMatch(/process\.argv|process\.env|raw Prisma where|WHERE clause/u);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|UPSERT|ALTER|CREATE|DROP|TRUNCATE)\b/u);
    expect(sql).not.toMatch(/\bFOR\s+(?:UPDATE|NO\s+KEY\s+UPDATE|SHARE|KEY\s+SHARE)\b/u);
    expect(READBACK_SQL.begin).toContain("READ ONLY");
  });
});

type Fixture = Readonly<{
  session: Readonly<Record<string, unknown>> | null;
  payments: readonly Readonly<Record<string, unknown>>[];
  events: readonly Readonly<Record<string, unknown>>[];
  orders: readonly Readonly<Record<string, unknown>>[];
}>;

function releasedFixture(): Fixture {
  return Object.freeze({
    session: Object.freeze({
      id: SESSION_ID,
      status: CheckoutSessionStatus.SUBMITTED,
      expiresAt: new Date("2026-09-01T08:00:00.000Z"),
      createdAt: new Date("2026-09-01T05:00:00.000Z"),
      updatedAt: OBSERVED_AT,
    }),
    payments: Object.freeze([releasedPayment()]),
    events: Object.freeze([q004Event()]),
    orders: Object.freeze([]),
  });
}

function activePayment(): Readonly<Record<string, unknown>> {
  return paymentRow({ blockingEndedAt: null, errorCode: null, errorMessage: null });
}

function releasedPayment(): Readonly<Record<string, unknown>> {
  return paymentRow({
    blockingEndedAt: OBSERVED_AT,
    errorCode: "EXIMBAY_NO_TRANSACTION_OBSERVED",
    errorMessage: "Eximbay retrieve returned Q004 at the observation used to release the checkout retry slot.",
  });
}

function paymentRow(overrides: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: "payment-contacted",
    checkoutSessionId: SESSION_ID,
    provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    status: PaymentAttemptStatus.INITIATED,
    attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
    remediationStatus: PaymentRemediationStatus.NONE,
    amount: 1000,
    currency: "USD",
    providerOrderId: "provider-order-safe",
    providerPaymentKey: null,
    contactStartedAt: new Date("2026-09-01T06:40:00.000Z"),
    financialSucceededAt: null,
    suspendedByPaymentId: null,
    createdAt: new Date("2026-09-01T06:39:00.000Z"),
    updatedAt: OBSERVED_AT,
    ...overrides,
  });
}

function q004Event(): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: "event-q004",
    provider: PaymentProvider.EXIMBAY,
    source: PaymentEventSource.API,
    transmissionId: "eximbay:checkout-recovery:q004:payment-contacted",
    eventType: "EXIMBAY_NO_TRANSACTION_OBSERVED",
    verifiedMode: PaymentMode.SANDBOX,
    verifiedCredentialBinding: "credential-binding-exact",
    checkoutSessionId: SESSION_ID,
    rawWithinBound: true,
    raw: Object.freeze({
      schema: "eximbay.checkout-recovery.q004",
      version: 1,
      paymentId: "payment-contacted",
      checkoutSessionId: SESSION_ID,
      providerOrderId: "provider-order-safe",
      mode: PaymentMode.SANDBOX,
      credentialBinding: "credential-binding-exact",
      providerCode: "Q004",
      observedAt: OBSERVED_AT.toISOString(),
      providerResult: Object.freeze({ rescode: "Q004" }),
    }),
    status: PaymentEventStatus.PROCESSED,
    receivedAt: OBSERVED_AT,
    processedAt: OBSERVED_AT,
  });
}

function orderRow(): Readonly<Record<string, unknown>> {
  return Object.freeze({
    id: "order-existing",
    checkoutSessionId: SESSION_ID,
    paymentId: "payment-contacted",
    status: "PAID",
    createdAt: new Date("2026-09-01T06:50:00.000Z"),
    updatedAt: new Date("2026-09-01T06:50:00.000Z"),
  });
}

function queryFixture(fixture: Fixture): Readonly<{
  query: FixedReadbackQuery;
  calls: readonly Readonly<{ sql: string; parameters: readonly unknown[] }>[];
}> {
  const calls: Readonly<{ sql: string; parameters: readonly unknown[] }>[] = [];
  const rowsBySql = new Map<string, readonly Readonly<Record<string, unknown>>[]>([
    [READBACK_SQL.begin, []],
    [READBACK_SQL.commit, []],
    [READBACK_SQL.rollback, []],
    [READBACK_SQL.identity, [Object.freeze({
      currentUser: CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_ROLE,
      currentDatabase: "refund_sandbox",
      transactionReadOnly: "on",
      capturedAt: CAPTURED_AT,
    })]],
    [READBACK_SQL.session, fixture.session ? [fixture.session] : []],
    [READBACK_SQL.paymentCount, [Object.freeze({ count: fixture.payments.length })]],
    [READBACK_SQL.payments, fixture.payments],
    [READBACK_SQL.eventCount, [Object.freeze({ count: fixture.events.length })]],
    [READBACK_SQL.events, fixture.events],
    [READBACK_SQL.orderCount, [Object.freeze({ count: fixture.orders.length })]],
    [READBACK_SQL.orders, fixture.orders],
  ]);
  const query: FixedReadbackQuery = (sql, parameters = []) => {
    calls.push(Object.freeze({ sql, parameters }));
    const rows = rowsBySql.get(sql);
    return rows ? Promise.resolve(rows) : Promise.reject(new Error("UNEXPECTED_FIXED_QUERY"));
  };
  return Object.freeze({ query, calls });
}

function readbackEnvironment(): Readonly<Record<string, string>> {
  return Object.freeze({
    MIRA_DB_BOOTSTRAP_PROJECT_ID: "mira-refund-sandbox-0001",
    MIRA_DB_BOOTSTRAP_REGION: "asia-northeast3",
    MIRA_DB_BOOTSTRAP_INSTANCE_CONNECTION_NAME:
      "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18",
    MIRA_DB_BOOTSTRAP_DATABASE_NAME: "refund_sandbox",
    MIRA_DB_BOOTSTRAP_IAM_DATABASE_USERNAME: CONTACTED_RECONCILIATION_BUSINESS_STATE_READBACK_ROLE,
    MIRA_DB_BOOTSTRAP_SOURCE_COMMIT: "a".repeat(40),
    MIRA_DB_BOOTSTRAP_IMAGE_DIGEST_URI:
      `asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:${"b".repeat(64)}`,
    MIRA_DB_BOOTSTRAP_MIGRATION_COUNT: "41",
    MIRA_DB_BOOTSTRAP_MIGRATION_SHA256:
      "4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c",
    MIRA_CONTACTED_RECONCILIATION_READBACK_RUN_ID: RUN_ID,
    MIRA_CONTACTED_RECONCILIATION_READBACK_CHECKOUT_SESSION_ID: SESSION_ID,
    MIRA_CONTACTED_RECONCILIATION_READBACK_EXECUTION: EXECUTION,
    MIRA_CONTACTED_RECONCILIATION_READBACK_EXECUTION_UID: EXECUTION_UID,
    CLOUD_RUN_JOB: "mira-p3e-sbx-contacted-readback",
    CLOUD_RUN_EXECUTION: "manual-readback-execution",
    CLOUD_RUN_TASK_COUNT: "1",
    CLOUD_RUN_TASK_INDEX: "0",
    CLOUD_RUN_TASK_ATTEMPT: "0",
  });
}

function runtimeDependencies(
  execute: RuntimeDependencies["execute"],
): RuntimeDependencies {
  return Object.freeze({
    readSourceCommit: () => Promise.resolve(`${"a".repeat(40)}\n`),
    loadMigrationInventory: () => Promise.resolve(Object.freeze({
      entries: Object.freeze([]),
      migrationCount: 41,
      migrationDigest: "4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c",
    })),
    execute,
  });
}

function outputSink() {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    stdoutLines,
    stderrLines,
    stdout: { write: (line: string) => { stdoutLines.push(line); return true; } },
    stderr: { write: (line: string) => { stderrLines.push(line); return true; } },
  };
}
