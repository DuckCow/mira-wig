import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../eximbay-refund-canary-target-binding", async () => {
  const actual = await vi.importActual<typeof import("../eximbay-refund-canary-target-binding")>(
    "../eximbay-refund-canary-target-binding",
  );
  return {
    ...actual,
    calculateEximbayCanaryTargetDigest: vi.fn(() =>
      "e9fc5296fa962cefbcfe17fd57f23c637ede5ed02408450146425ce2dbc1953c"),
  };
});
import {
  REFUND_READINESS_BUSINESS_STATE_READBACK_ROLE,
  readRefundReadinessBusinessState,
  type RefundReadinessQuery,
} from "../../../../../containers/refund-db-bootstrap/refund-readiness-business-state-readback";
import {
  applyRefundReadinessReadbackRoleGrants,
  defaultEximbayP3eDatabaseBootstrapDependencies,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
  revokeRefundReadinessReadbackRoleGrants,
} from "../../../../../scripts/eximbay-p3e-database-bootstrap";

const execFile = promisify(execFileCallback);
const ROOT = process.cwd();
const ROLE = REFUND_READINESS_BUSINESS_STATE_READBACK_ROLE;
const DATABASE = "refund_sandbox";

describe.sequential("refund-readiness readback disposable PostgreSQL privileges", () => {
  let clusterRoot = "";
  let dataDirectory = "";
  let socketDirectory = "";
  let port = 0;
  let adminUrl = "";
  let roleUrl = "";

  beforeAll(async () => {
    clusterRoot = await mkdtemp(join(tmpdir(), "mira-refund-readiness-pg-"));
    dataDirectory = join(clusterRoot, "data");
    socketDirectory = join(clusterRoot, "socket");
    port = await unusedPort();
    await mkdir(socketDirectory, { mode: 0o700 });
    await run("initdb", ["-D", dataDirectory, "-A", "trust", "-U", "postgres", "--no-locale"]);
    await run("pg_ctl", ["-D", dataDirectory, "-l", join(clusterRoot, "postgres.log"), "-o",
      `-F -h 127.0.0.1 -p ${port} -k ${socketDirectory}`, "-w", "start"]);
    await run("createdb", ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", DATABASE]);
    adminUrl = `postgresql://postgres@127.0.0.1:${port}/${DATABASE}`;
    roleUrl = `postgresql://${encodeURIComponent(ROLE)}@127.0.0.1:${port}/${DATABASE}`;
    await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      DATABASE_URL: adminUrl,
    });
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(`
        CREATE ROLE cloudsqliamserviceaccount NOLOGIN;
        CREATE ROLE mira_refund_preflight NOLOGIN;
        CREATE ROLE mira_refund_canary NOLOGIN;
        CREATE ROLE "${ROLE}" LOGIN IN ROLE cloudsqliamserviceaccount;
        CREATE SEQUENCE "ReadbackForbiddenSequence";
      `);
      await applyRefundReadinessReadbackRoleGrants(admin, {
        admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
        environment: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
        targetDatabaseName: DATABASE,
      }, {
        ...defaultEximbayP3eDatabaseBootstrapDependencies,
        verifyExactLedger: () => Promise.resolve(),
      });
      await seedExactReadyState(admin);
    } finally {
      await admin.end();
    }
  }, 120_000);

  afterAll(async () => {
    if (dataDirectory) {
      await run("pg_ctl", ["-D", dataDirectory, "-m", "fast", "-w", "stop"])
        .catch(() => undefined);
    }
    if (clusterRoot) await rm(clusterRoot, { recursive: true, force: true });
  }, 30_000);

  it("executes a READY mixed-history snapshot as repeatable-read/read-only with zero writes", async () => {
    const before = await businessCounts(adminUrl);
    const database = new Client({ connectionString: roleUrl });
    await database.connect();
    try {
      const query: RefundReadinessQuery = async (sql, parameters = []) => {
        const result = await database.query<Record<string, unknown>>(sql, [...parameters]);
        return result.rows;
      };
      const result = await readRefundReadinessBusinessState(query);
      expect(result).toMatchObject({
        terminalResult: "READY",
        databaseUser: ROLE,
        transactionIsolation: "repeatable read",
        transactionReadOnly: true,
        currentGeneration: 2,
        authorizationInventory: {
          rowsTotal: 12,
          currentGenerationUnusedExpired: 1,
          currentGenerationRevoked: 11,
          nextRequirement: "REVOKE_EXPIRED_THEN_ISSUE_ONE_FRESH_AUTHORIZATION",
        },
        leaseState: { state: "EXPIRED", blocksNextExecution: false },
        dispatch: { providerContactState: "PROVEN_NONE" },
        exactTargetAlreadyRefunded: "NO",
        duplicateRefundRisk: "NONE",
        durableHistoryCoherent: "YES",
        proposedOneShotEffectUpperBounds: {
          AUTHORIZATION_ISSUANCES_MAX: { max: 1 },
          AUTHORIZATION_REVOCATIONS_MAX: { max: 1 },
        },
        readyForOneShotLiveRefundAuthorityDecision: true,
        providerEffects: 0,
        durableWrites: 0,
      });
    } finally {
      await database.end();
    }
    expect(await businessCounts(adminUrl)).toEqual(before);
  });

  it.each([
    ["ungranted column", 'SELECT "errorMessage" FROM "Payment" LIMIT 1'],
    ["unrelated table", 'SELECT "id" FROM "User" LIMIT 1'],
    ["insert", 'INSERT INTO "Payment" DEFAULT VALUES'],
    ["update", 'UPDATE "Payment" SET "status" = "status" WHERE false'],
    ["delete", 'DELETE FROM "Payment" WHERE false'],
    ["truncate", 'TRUNCATE TABLE "Payment"'],
    ["sequence", 'SELECT nextval(\'"ReadbackForbiddenSequence"\')'],
    ["row lock", 'SELECT "id" FROM "Payment" WHERE false FOR UPDATE'],
    ["role escalation", "SET ROLE mira_refund_canary"],
  ])("denies %s authority", async (_label, sql) => {
    await expectDenied(roleUrl, sql);
  });

  it("revokes the exact readback authority", async () => {
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await revokeRefundReadinessReadbackRoleGrants(admin, {
        admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
        environment: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
        targetDatabaseName: DATABASE,
      }, {
        ...defaultEximbayP3eDatabaseBootstrapDependencies,
        verifyExactLedger: () => Promise.resolve(),
      });
    } finally {
      await admin.end();
    }
    await expectDenied(roleUrl, 'SELECT "id" FROM "Payment" LIMIT 1');
  });
});

async function run(
  executable: string,
  args: readonly string[],
  extraEnvironment: Readonly<Record<string, string>> = {},
): Promise<void> {
  await execFile(executable, [...args], {
    cwd: ROOT,
    env: { ...process.env, ...extraEnvironment },
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function seedExactReadyState(database: Client): Promise<void> {
  await database.query("SET session_replication_role = replica");
  try {
    await database.query(`
      INSERT INTO "CheckoutSession" (
        "id", "userId", "marketCode", "communicationLocale", "currency", "status",
        "subtotalAmount", "shippingAmount", "totalAmount", "expiresAt", "createdAt", "updatedAt"
      ) VALUES (
        'checkout-fixed', 'user-fixed', 'US', 'en', 'USD', 'COMPLETED',
        100, 0, 100, '2026-09-08T09:00:00Z', '2026-09-08T07:40:00Z', '2026-09-08T08:00:00Z'
      );
      INSERT INTO "Payment" (
        "id", "checkoutSessionId", "provider", "mode", "adapterExecutionKind", "status",
        "attemptLifecycle", "amount", "currency", "providerOrderId", "providerPaymentKey",
        "idempotencyKey", "financialSucceededAt", "blockingEndedAt", "createdAt", "updatedAt"
      ) VALUES (
        'cmtsdmk16000201s6alc0evek', 'checkout-fixed', 'EXIMBAY', 'SANDBOX', 'EXTERNAL',
        'SUCCEEDED', 'FINALIZED', 100, 'USD', 'c000000000000000000000001', 'private-payment-ref',
        'payment-fixed-idempotency', '2026-09-08T07:50:00Z', '2026-09-08T07:50:00Z',
        '2026-09-08T07:45:00Z', '2026-09-08T08:00:00Z'
      );
      INSERT INTO "Order" (
        "id", "checkoutSessionId", "paymentId", "userId", "marketCode", "currency",
        "subtotalAmount", "shippingAmount", "totalAmount", "status", "paidAt", "createdAt", "updatedAt"
      ) VALUES (
        'cmtsdmo8r000401s671x1chsp', 'checkout-fixed', 'cmtsdmk16000201s6alc0evek',
        'user-fixed', 'US', 'USD', 100, 0, 100, 'REFUND_PENDING',
        '2026-09-08T07:50:00Z', '2026-09-08T07:50:00Z', '2026-09-08T08:00:00Z'
      );
      INSERT INTO "RefundAttempt" (
        "id", "orderId", "paymentId", "amount", "currency", "status", "reason",
        "actorType", "actorUserId", "provider", "mode", "providerRefundId",
        "idempotencyKey", "requestedAt", "processedAt", "failedAt", "failureCode",
        "safeFailureMessage", "createdAt", "updatedAt"
      ) VALUES (
        'eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8',
        'cmtsdmo8r000401s671x1chsp', 'cmtsdmk16000201s6alc0evek', 100, 'USD', 'PROCESSING',
        'Attended fresh synthetic Eximbay SANDBOX canary full refund.', 'SYSTEM', NULL,
        'EXIMBAY', 'SANDBOX', NULL,
        'refund:cmtsdmk16000201s6alc0evek:eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8',
        '2026-09-08T07:50:00Z', NULL, NULL, NULL, NULL,
        '2026-09-08T07:50:00Z', '2026-09-08T08:20:00Z'
      );
      INSERT INTO "RefundExecutionCommand" (
        "id", "refundAttemptId", "status", "availableAt", "leaseOwner", "leaseUntil",
        "leaseGeneration", "leaseTokenHash", "dispatchAttempt", "lastSafeErrorCode",
        "lastSafeErrorMessage", "createdAt", "updatedAt"
      ) VALUES (
        'cmtsdrrxk00010ss6we7g8qe7',
        'eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8', 'LEASED',
        '2026-09-08T08:00:00Z', 'historical-execution', '2026-09-08T08:25:00Z', 2,
        repeat('a', 64), 0, NULL, NULL, '2026-09-08T08:00:00Z', '2026-09-08T08:20:00Z'
      );
      INSERT INTO "EximbayRefundSandboxCanaryApproval" (
        "id", "formatVersion", "provider", "mode", "approvalEvidenceDigest",
        "releaseBindingDigest", "canaryJobBindingDigest", "preflightJobBindingDigest",
        "imageBindingDigest", "secretGenerationBindingDigest", "targetBindingDigest",
        "commandId", "approvedAt", "expiresAt", "issuedByPrincipalId", "consumedAt",
        "consumedExecutionId", "consumedExecutionBindingDigest", "createdAt"
      ) VALUES (
        'eximbay-canary-approval-cd3e243b-97da-41d2-9bdc-c1dc001065cc',
        'mira-refund-eximbay-sandbox-canary-approval/v1', 'EXIMBAY', 'SANDBOX',
        repeat('1', 64), repeat('2', 64), repeat('3', 64), repeat('4', 64),
        repeat('5', 64), repeat('6', 64),
        'e9fc5296fa962cefbcfe17fd57f23c637ede5ed02408450146425ce2dbc1953c',
        'cmtsdrrxk00010ss6we7g8qe7', '2026-09-08T08:00:00Z',
        '2026-09-08T08:30:00Z', 'historical-issuer', '2026-09-08T08:07:49Z',
        'historical-execution', repeat('7', 64), '2026-09-08T08:00:00Z'
      );
      INSERT INTO "RefundExecutionProviderOperationBinding" (
        "id", "refundAttemptId", "provider", "mode", "providerOperationKey",
        "operationKeyAlgorithmVersion", "wireContractVersion", "wireRequestFingerprint",
        "merchantAccountBindingId", "credentialGenerationBindingId", "createdAt"
      ) VALUES (
        'cmtsdrs0900030ss6qwxcgar6',
        'eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8', 'EXIMBAY', 'SANDBOX',
        'eximbay-refund-family-v1-a2d09d6749cea4634bcd11078f719631d8c0b8923e510985fd3f4caafd382f62',
        'eximbay-refund-family-v1', 'refund-provider-eximbay-cancel-wire/v1',
        'a2d09d6749cea4634bcd11078f719631d8c0b8923e510985fd3f4caafd382f62',
        '783244bb25ed5c7506bd3589e8b252e683c65f265068673dbe4d18e415477893',
        '2c03724ab5f9746b50815e888ef1619719b5ab1590ac69873487d337ffd50c73',
        '2026-09-08T08:00:00Z'
      );
      INSERT INTO "RefundExecutionCommandEvent" (
        "id", "commandId", "eventType", "leaseGeneration", "dispatchAttempt", "occurredAt", "createdAt"
      ) VALUES
        ('event-generation-1', 'cmtsdrrxk00010ss6we7g8qe7', 'LEASE_ACQUIRED', 1, 0,
          '2026-09-08T08:07:50Z', '2026-09-08T08:07:50Z'),
        ('event-generation-2', 'cmtsdrrxk00010ss6we7g8qe7', 'LEASE_ACQUIRED', 2, 0,
          '2026-09-08T08:20:00Z', '2026-09-08T08:20:00Z');
      INSERT INTO "RefundAttemptTransition" (
        "id", "refundAttemptId", "fromStatus", "toStatus", "orderStatusBefore",
        "orderStatusAfter", "actorType", "actorUserId", "reason", "operationKey", "createdAt"
      ) VALUES
        ('transition-request', 'eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8',
          NULL, 'REQUESTED', 'PAID', 'REFUND_PENDING', 'SYSTEM', NULL,
          'Attended fresh synthetic Eximbay SANDBOX canary full refund.',
          'refund-request:eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8',
          '2026-09-08T07:50:00Z'),
        ('transition-claim', 'eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8',
          'REQUESTED', 'PROCESSING', 'REFUND_PENDING', 'REFUND_PENDING', 'SYSTEM', NULL,
          'Refund execution claimed.', 'refund-exec-claim:cmtsdrrxk00010ss6we7g8qe7',
          '2026-09-08T08:00:00Z');
      INSERT INTO "RefundExecutionAuthorization" (
        "id", "issuanceRequestId", "commandId", "refundAttemptId",
        "providerOperationBindingId", "targetBindingDigest", "expectedPredecessorGeneration",
        "operationClass", "releasePolicyDigest", "issuedByUserId", "issuedAt", "expiresAt"
      ) VALUES (
        'authorization-expired', '00000000-0000-4000-8000-000000000001',
        'cmtsdrrxk00010ss6we7g8qe7',
        'eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8',
        'cmtsdrs0900030ss6qwxcgar6',
        'e9fc5296fa962cefbcfe17fd57f23c637ede5ed02408450146425ce2dbc1953c', 2,
        'EXIMBAY_SANDBOX_BOUND_ORDINAL_ZERO_REENTRY',
        '5ee57ccdbedc79e0837df0491b9c5942fa47fa8462f1332f3766adfd24750be6',
        'admin-fixed', clock_timestamp() - interval '20 minutes',
        clock_timestamp() - interval '10 minutes'
      );
      INSERT INTO "RefundExecutionAuthorization" (
        "id", "issuanceRequestId", "commandId", "refundAttemptId",
        "providerOperationBindingId", "targetBindingDigest", "expectedPredecessorGeneration",
        "operationClass", "releasePolicyDigest", "issuedByUserId", "issuedAt", "expiresAt",
        "revokedAt", "revokedByUserId"
      ) VALUES
        (
          'authorization-historical-1', '00000000-0000-4000-8000-000000000002',
          'cmtsdrrxk00010ss6we7g8qe7',
          'eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8',
          'cmtsdrs0900030ss6qwxcgar6',
          'e9fc5296fa962cefbcfe17fd57f23c637ede5ed02408450146425ce2dbc1953c', 2,
          'EXIMBAY_SANDBOX_BOUND_ORDINAL_ZERO_REENTRY',
          '48eabfff63ec506721913f9f7566cbd4ee12474ba629460560a9b6bbb4a2312a',
          'admin-fixed', clock_timestamp() - interval '25 minutes',
          clock_timestamp() - interval '5 minutes', clock_timestamp() - interval '10 minutes',
          'admin-fixed'
        ),
        (
          'authorization-historical-2', '00000000-0000-4000-8000-000000000003',
          'cmtsdrrxk00010ss6we7g8qe7',
          'eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8',
          'cmtsdrs0900030ss6qwxcgar6',
          'e9fc5296fa962cefbcfe17fd57f23c637ede5ed02408450146425ce2dbc1953c', 2,
          'EXIMBAY_SANDBOX_BOUND_ORDINAL_ZERO_REENTRY',
          'c94117d2813c480941e3c28c516b1ad9d72c5219e247e655fcb508e92b0c6fa3',
          'admin-fixed', clock_timestamp() - interval '25 minutes',
          clock_timestamp() - interval '5 minutes', clock_timestamp() - interval '10 minutes',
          'admin-fixed'
        );
      INSERT INTO "RefundExecutionAuthorization" (
        "id", "issuanceRequestId", "commandId", "refundAttemptId",
        "providerOperationBindingId", "targetBindingDigest", "expectedPredecessorGeneration",
        "operationClass", "releasePolicyDigest", "issuedByUserId", "issuedAt", "expiresAt",
        "revokedAt", "revokedByUserId"
      )
      SELECT
        'authorization-current-revoked-' || series,
        ('00000000-0000-4000-8000-' || lpad((series + 3)::text, 12, '0'))::uuid,
        'cmtsdrrxk00010ss6we7g8qe7',
        'eximbay-canary-7f9188b209f5f8504df28fe300e53aba980859e8',
        'cmtsdrs0900030ss6qwxcgar6',
        'e9fc5296fa962cefbcfe17fd57f23c637ede5ed02408450146425ce2dbc1953c', 2,
        'EXIMBAY_SANDBOX_BOUND_ORDINAL_ZERO_REENTRY',
        '5ee57ccdbedc79e0837df0491b9c5942fa47fa8462f1332f3766adfd24750be6',
        'admin-fixed', clock_timestamp() - interval '25 minutes',
        clock_timestamp() - interval '5 minutes', clock_timestamp() - interval '10 minutes',
        'admin-fixed'
      FROM generate_series(1, 9) AS series;
    `);
  } finally {
    await database.query("SET session_replication_role = origin");
  }
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const selected = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
  if (selected === 0) throw new Error("DISPOSABLE_POSTGRES_PORT_UNAVAILABLE");
  return selected;
}

async function businessCounts(connectionString: string): Promise<Readonly<Record<string, number>>> {
  const database = new Client({ connectionString });
  await database.connect();
  try {
    const result: Record<string, number> = {};
    for (const table of [
      "Payment", "Order", "RefundAttempt", "RefundExecutionCommand",
      "RefundExecutionAuthorization", "RefundExecutionCommandEvent",
      "RefundExecutionDispatchAttempt", "RefundExecutionEvidence",
      "RefundAttemptTransition", "PaymentOutbox",
    ]) {
      const rows = await database.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM "${table}"`,
      );
      result[table] = rows.rows[0]?.count ?? -1;
    }
    return Object.freeze(result);
  } finally {
    await database.end();
  }
}

async function expectDenied(connectionString: string, sql: string): Promise<void> {
  const database = new Client({ connectionString });
  await database.connect();
  try {
    await expect(database.query(sql)).rejects.toMatchObject({ code: "42501" });
  } finally {
    await database.end();
  }
}
