import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import contract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/database-bootstrap-runtime-v1.json";
import {
  awaitProxyReadiness,
  BOOTSTRAP_FAILURE_CODES,
  CANARY_ROLE_GRANT_MODE,
  classifyProxyStructuredLogLine,
  classifyProxyStructuredLogLineDetails,
  consumeProxyDiagnosticStream,
  PROXY_DIAGNOSTIC_BYTE_LIMIT,
  PROXY_FAILURE_CLASSES,
  PROXY_STDIO,
  PROXY_TRANSPORT_CLASSES,
  proxyArguments,
  retainProxyThroughDatabaseWork,
  requireDatabaseConnection,
  requireExactLedgerRows,
  requireLedgerRead,
  runDatabaseBootstrapEntrypoint,
  type RuntimeConfiguration,
  type RuntimeDependencies,
} from "../../../../../containers/refund-db-bootstrap/entrypoint";
import {
  requireRoleSafety,
  type RoleSafetyRow,
} from "../../../../../scripts/eximbay-p3e-database-bootstrap";
import {
  loadRefundWorkerMigrationInventory,
  type RefundWorkerMigrationInventory,
} from "../worker-migration-inventory";

const ROOT = process.cwd();
const COMMIT = "a".repeat(40);
const DIGEST = "b".repeat(64);
const SENSITIVE_DIAGNOSTIC =
  "oauth-token password=secret DATABASE_URL=postgresql://secret";
const VALID_ENV = Object.freeze({
  MIRA_DB_BOOTSTRAP_PROJECT_ID: "mira-refund-sandbox-0001",
  MIRA_DB_BOOTSTRAP_REGION: "asia-northeast3",
  MIRA_DB_BOOTSTRAP_INSTANCE_CONNECTION_NAME:
    "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18",
  MIRA_DB_BOOTSTRAP_DATABASE_NAME: "refund_sandbox",
  MIRA_DB_BOOTSTRAP_IAM_DATABASE_USERNAME:
    "mira-p3e-sbx-db-bootstrap@mira-refund-sandbox-0001.iam",
  MIRA_DB_BOOTSTRAP_SOURCE_COMMIT: COMMIT,
  MIRA_DB_BOOTSTRAP_IMAGE_DIGEST_URI:
    `asia-northeast3-docker.pkg.dev/mira-refund-sandbox-0001/mira-p3e-sbx-refund-images/refund-db-bootstrap@sha256:${DIGEST}`,
  MIRA_DB_BOOTSTRAP_MIGRATION_COUNT: "41",
  MIRA_DB_BOOTSTRAP_MIGRATION_SHA256:
    "4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c",
  CLOUD_RUN_JOB: "mira-p3e-sbx-refund-db-bootstrap",
  CLOUD_RUN_EXECUTION: "manual-future-execution",
  CLOUD_RUN_TASK_COUNT: "1",
  CLOUD_RUN_TASK_INDEX: "0",
  CLOUD_RUN_TASK_ATTEMPT: "0",
});
const INVALID_MODE_VECTORS: readonly Readonly<{ args: readonly string[] }>[] = [
  { args: [] },
  { args: ["unknown"] },
  { args: ["apply", "extra"] },
];

describe("P3E-B2 dormant database-bootstrap runtime", () => {
  it("uses only Cloud SQL-compatible role creation and password sanitation", () => {
    const roleSql = readFileSync(
      join(ROOT, "infra/refund-sandbox/p3e-b2/runtime-deferred/database_roles.sql"),
      "utf8",
    );
    expect([...roleSql.matchAll(/^\s*CREATE ROLE [^;]+;/gmu)].map(([statement]) =>
      statement.trim())).toEqual([
      "CREATE ROLE mira_refund_preflight LOGIN NOINHERIT;",
      "CREATE ROLE mira_refund_canary LOGIN NOINHERIT;",
    ]);
    expect(roleSql).not.toMatch(
      /^\s*CREATE ROLE [^;]*(?:SUPERUSER|CREATEDB|CREATEROLE|REPLICATION|BYPASSRLS|PASSWORD)/gmu,
    );
    expect([...roleSql.matchAll(/^ALTER ROLE [^;]+;/gmu)].map(([statement]) =>
      statement.trim())).toEqual([
      "ALTER ROLE mira_refund_preflight PASSWORD NULL;",
      "ALTER ROLE mira_refund_canary PASSWORD NULL;",
    ]);
    expect(roleSql.slice(roleSql.indexOf("GRANT CONNECT"))).not.toBe("");
    expect(sha256(roleSql.slice(roleSql.indexOf("GRANT CONNECT")))).toBe(
      "59e6155e0a23c0b538414d84ff5ec542ad7d2ad3ee9dd27d71f94520d06f553c",
    );
  });

  it("fails closed on every unsafe existing-role attribute mismatch", () => {
    const exact = Object.freeze<RoleSafetyRow>({
      canLogin: true,
      superuser: false,
      createDatabase: false,
      createRole: false,
      inherit: false,
      replication: false,
      bypassRls: false,
      connect: true,
      databaseCreate: false,
      schemaUsage: true,
      schemaCreate: false,
      membershipCount: 0,
    });
    const unsafe = Object.freeze<readonly Partial<RoleSafetyRow>[]>([
      { canLogin: false },
      { superuser: true },
      { createDatabase: true },
      { createRole: true },
      { inherit: true },
      { replication: true },
      { bypassRls: true },
    ]);
    expect(() => requireRoleSafety([exact])).not.toThrow();
    for (const mutation of unsafe) {
      expect(() => requireRoleSafety([{ ...exact, ...mutation }])).toThrowError(
        "ROLE_AUTHORITY_POSTCONDITION_FAILED",
      );
    }
  });

  it.each(INVALID_MODE_VECTORS)(
    "rejects non-exact mode vector $args before execution",
    async ({ args }) => {
      const execute = executeMock();
      const result = await runDatabaseBootstrapEntrypoint(
        args,
        VALID_ENV,
        outputSink(),
        dependencies(execute),
      );
      expect(result).toBe(64);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["password", { DATABASE_URL: "postgresql://forbidden" }],
    ["provider", { TOSS_SANDBOX_SECRET_KEY: "forbidden" }],
    ["proxy override", { CSQL_PROXY_CREDENTIALS_FILE: "forbidden" }],
    ["retry", { CLOUD_RUN_TASK_ATTEMPT: "1" }],
  ])("rejects %s before any database/proxy owner runs", async (_name, mutation) => {
    const execute = executeMock();
    const result = await runDatabaseBootstrapEntrypoint(
      ["check"],
      { ...VALID_ENV, ...mutation },
      outputSink(),
      dependencies(execute),
    );
    expect(result).toBe(64);
    expect(execute).not.toHaveBeenCalled();
  });

  it("admits exact check configuration without converting it to apply", async () => {
    const execute = executeMock(Object.freeze({
      code: "DB_BOOTSTRAP_CHECK_READY",
      mode: "check",
      databaseMutation: false,
    }));
    const output = outputSink();
    const result = await runDatabaseBootstrapEntrypoint(
      ["check"],
      VALID_ENV,
      output,
      dependencies(execute),
    );
    expect(result).toBe(0);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0]).toMatchObject({ mode: "check" });
    expect(output.stdoutLines).toEqual([
      '{"ok":true,"code":"DB_BOOTSTRAP_CHECK_READY","mode":"check","databaseMutation":false}\n',
    ]);
  });

  it("admits only the exact canary role-grant mode", async () => {
    const execute = executeMock(Object.freeze({
      code: "EXIMBAY_P3E_CANARY_ROLE_GRANTS_COMPLETE",
      mode: CANARY_ROLE_GRANT_MODE,
    }));
    const result = await runDatabaseBootstrapEntrypoint(
      [CANARY_ROLE_GRANT_MODE],
      VALID_ENV,
      outputSink(),
      dependencies(execute),
    );
    expect(result).toBe(0);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      mode: "apply-canary-role-grants",
    });
  });

  it("admits only the exact credential-materialization mode without changing the default", async () => {
    const execute = executeMock(Object.freeze({
      code: "APP_CREDENTIAL_MATERIALIZATION_COMPLETE",
      mode: "materialize-application-credentials",
    }));
    const result = await runDatabaseBootstrapEntrypoint(
      ["materialize-application-credentials"],
      VALID_ENV,
      outputSink(),
      dependencies(execute),
    );
    expect(result).toBe(0);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      mode: "materialize-application-credentials",
    });
  });

  it("admits only the exact canary credential recovery mode", async () => {
    const execute = executeMock(Object.freeze({
      code: "APP_CREDENTIAL_CANARY_RECOVERY_COMPLETE",
      mode: "recover-canary-application-credential",
    }));
    const result = await runDatabaseBootstrapEntrypoint(
      ["recover-canary-application-credential"],
      VALID_ENV,
      outputSink(),
      dependencies(execute),
    );
    expect(result).toBe(0);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      mode: "recover-canary-application-credential",
    });
    expect(contract.image.mutatingModes).toEqual([
      "apply",
      "apply-canary-role-grants",
      "apply-contacted-reconciliation-role-grants",
      "materialize-application-credentials",
      "recover-canary-application-credential",
      "restore-canary-refund-role-grants",
    ]);
    expect(contract.job.explicitCredentialArguments).toEqual([
      "materialize-application-credentials",
      "recover-canary-application-credential",
    ]);
    expect(contract.job.explicitGrantOnlyArgument).toBe("apply-canary-role-grants");
    expect(contract.job.terraformModeSelector).toEqual({
      input: "bootstrap_mode",
      owner: "TERRAFORM",
      allowedModes: [
        "check",
        "apply-contacted-reconciliation-role-grants",
        "restore-canary-refund-role-grants",
      ],
      defaultMode: "check",
      jobArgumentsBinding: ["var.bootstrap_mode"],
      executionOverrideSurface: "ABSENT",
    });
    expect(contract.job.secretVersionProjectRepresentations).toEqual([
      "mira-refund-sandbox-0001",
      "925882331349",
    ]);
    expect(contract.job.initialCredentialAdmission).toEqual({
      preflightVersionCount: 0,
      canaryVersionCount: 0,
    });
    expect(contract.job.canaryRecoveryAdmission).toEqual({
      preflightVersionCount: 1,
      preflightVersion: "1",
      preflightState: "ENABLED",
      preflightClientSpecifiedPayloadChecksum: true,
      canaryVersionCount: 0,
      preflightPayloadAccess: "NONE",
    });
  });

  it("freezes the private automatic-IAM proxy vector", () => {
    expect(proxyArguments()).toEqual([
      "--structured-logs",
      "--private-ip",
      "--auto-iam-authn",
      "--unix-socket=/cloudsql",
      "--health-check",
      "--http-address=127.0.0.1",
      "--http-port=9801",
      "--exit-zero-on-sigterm",
      "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18",
    ]);
    expect(proxyArguments(false)).toEqual([
      "--structured-logs",
      "--private-ip",
      "--unix-socket=/cloudsql",
      "--health-check",
      "--http-address=127.0.0.1",
      "--http-port=9801",
      "--exit-zero-on-sigterm",
      "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18",
    ]);
  });

  it("pipes and boundedly consumes Proxy output without retaining raw bytes", () => {
    expect(PROXY_STDIO).toEqual(["ignore", "pipe", "pipe"]);
    const stream = new PassThrough();
    const summary = consumeProxyDiagnosticStream(stream);
    const sensitive = "oauth-token password=secret DATABASE_URL=postgresql://secret";
    stream.write(sensitive.repeat(200));
    stream.end();
    expect(summary).toEqual({
      observedBytes: PROXY_DIAGNOSTIC_BYTE_LIMIT,
      truncated: true,
      failureClass: null,
      requestSubtype: null,
    });
    expect(JSON.stringify(summary)).not.toContain(sensitive);
    expect(JSON.stringify(summary)).not.toContain("postgresql://secret");
  });

  it.each([
    [
      "credential initialization",
      "The proxy has encountered a terminal error: unable to start: error initializing dialer: failed to create default credentials: credentials: could not find default credentials",
      "PROXY_CREDENTIAL_SOURCE_FAILED",
    ],
    [
      "SQL Admin permission",
      "[mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18] could not resolve instance version: failed to get instance: refresh error: failed to get instance metadata (connection name = \"mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18\"): googleapi: Error 403: permission denied",
      "PROXY_SQLADMIN_PERMISSION_DENIED",
    ],
    [
      "SQL Admin request",
      "[mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18] could not resolve instance version: failed to get instance: refresh error: failed to get instance metadata (connection name = \"mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18\"): Get \"https://sqladmin.googleapis.com/sql/v1beta4/projects/example/instances/example/connectSettings\": network unavailable",
      "PROXY_SQLADMIN_REQUEST_FAILED",
    ],
    [
      "instance configuration",
      "[invalid] could not resolve instance version: config error: invalid instance connection name, expected PROJECT:REGION:INSTANCE (connection name = \"invalid\")",
      "PROXY_INSTANCE_CONFIG_FAILED",
    ],
    [
      "listener",
      "[mira-refund-sandbox-0001:asia-northeast3:mira-p3e-b2-refund-pg18] could not mount unix socket \"/cloudsql\": permission denied",
      null,
    ],
    [
      "exact listener",
      "[mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18] could not mount unix socket \"/cloudsql\": permission denied",
      "PROXY_LISTENER_FAILED",
    ],
  ])("classifies exact v2.22.0 structured %s errors", (_name, message, expected) => {
    expect(classifyProxyStructuredLogLine(structuredProxyLog("ERROR", message))).toBe(expected);
  });

  it("does not promote substrings, non-errors, malformed JSON, or raw secrets", () => {
    const permissionMessage =
      "[mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18] could not resolve instance version: failed to get instance: refresh error: failed to get instance metadata (connection name = \"mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18\"): googleapi: Error 500: server text contains googleapi: Error 403: oauth-token password=secret";
    expect(classifyProxyStructuredLogLine(
      structuredProxyLog("ERROR", permissionMessage),
    )).toBe("PROXY_SQLADMIN_REQUEST_FAILED");
    expect(classifyProxyStructuredLogLine(
      structuredProxyLog("INFO", permissionMessage),
    )).toBeNull();
    expect(classifyProxyStructuredLogLine("not-json oauth-token password=secret")).toBeNull();
  });

  it.each([
    ["401", "googleapi: Error 401: unauthenticated", 401],
    ["404", "googleapi: Error 404: not found", 404],
    ["429", "googleapi: Error 429: resource exhausted", 429],
    ["500", "googleapi: Error 500: backend error", 500],
    [
      "fallback 503",
      "googleapi: got HTTP response code 503 with body: upstream body is discarded",
      503,
    ],
  ])("retains only the exact Google API HTTP status for %s", (_name, failure, status) => {
    expect(sqlAdminRequestDetails(failure)).toEqual({
      failureClass: "PROXY_SQLADMIN_REQUEST_FAILED",
      requestSubtype: {
        requestPhase: "INSTANCE_METADATA",
        host: "sqladmin.googleapis.com",
        httpStatus: status,
      },
    });
  });

  it.each([
    [
      "token acquisition",
      "credentials: cannot fetch token: Get \"http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?secret=token-like-value\": context deadline exceeded",
      { transportClass: "TOKEN", timeout: true },
    ],
    [
      "DNS",
      "dial tcp: lookup sqladmin.googleapis.com on 169.254.169.254:53: no such host",
      { transportClass: "DNS" },
    ],
    [
      "DNS timeout",
      "dial tcp: lookup sqladmin.googleapis.com on 169.254.169.254:53: i/o timeout",
      { transportClass: "DNS", timeout: true },
    ],
    [
      "connect refused",
      "dial tcp 199.36.153.4:443: connect: connection refused",
      { transportClass: "CONNECT" },
    ],
    [
      "connect unreachable",
      "dial tcp 199.36.153.4:443: connect: network is unreachable",
      { transportClass: "CONNECT" },
    ],
    [
      "TLS certificate",
      "tls: failed to verify certificate: x509: certificate signed by unknown authority",
      { transportClass: "TLS" },
    ],
    [
      "context deadline",
      "context deadline exceeded",
      { transportClass: "TIMEOUT", timeout: true },
    ],
    [
      "TLS handshake timeout",
      "net/http: TLS handshake timeout",
      { transportClass: "TIMEOUT", timeout: true },
    ],
    [
      "connection reset",
      "read tcp 10.0.0.2:54321->199.36.153.4:443: read: connection reset by peer",
      { transportClass: "RESET" },
    ],
    ["unknown", "network unavailable secret=token-like-value", { transportClass: "OTHER" }],
  ])("classifies only pinned request transport evidence: %s", (_name, cause, expected) => {
    expect(sqlAdminRequestDetails(metadataUrlError(cause))).toEqual({
      failureClass: "PROXY_SQLADMIN_REQUEST_FAILED",
      requestSubtype: {
        requestPhase: "INSTANCE_METADATA",
        host: "sqladmin.googleapis.com",
        ...expected,
      },
    });
  });

  it("preserves the installed exact 403 permission path", () => {
    expect(sqlAdminRequestDetails("googleapi: Error 403: permission denied")).toEqual({
      failureClass: "PROXY_SQLADMIN_PERMISSION_DENIED",
      requestSubtype: null,
    });
  });

  it("does not extract status numbers or network classes from unrelated text", () => {
    expect(sqlAdminRequestDetails(metadataUrlError(
      "server mentioned Error 429 and lookup sqladmin.googleapis.com in prose",
    ))?.requestSubtype).toEqual({
      requestPhase: "INSTANCE_METADATA",
      host: "sqladmin.googleapis.com",
      transportClass: "OTHER",
    });
    expect(sqlAdminRequestDetails(
      "Get \"https://example.com/sql/v1beta4/projects/123/instances/456/connectSettings?token=secret\": context deadline exceeded",
    )).toBeNull();
  });

  it.each([
    [
      "wrong method",
      "Post \"https://sqladmin.googleapis.com/sql/v1beta4/projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18/connectSettings\": context deadline exceeded",
    ],
    [
      "wrong same-host path",
      "Get \"https://sqladmin.googleapis.com/sql/v1beta4/projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18/other\": context deadline exceeded",
    ],
    [
      "fragment",
      "Get \"https://sqladmin.googleapis.com/sql/v1beta4/projects/mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18/connectSettings#fragment\": context deadline exceeded",
    ],
  ])("withholds subtype fields for a same-host %s envelope", (_name, failure) => {
    expect(sqlAdminRequestDetails(failure)).toEqual({
      failureClass: "PROXY_SQLADMIN_REQUEST_FAILED",
      requestSubtype: null,
    });
  });

  it("parses split structured records without retaining or forwarding raw messages", () => {
    const stream = new PassThrough();
    const summary = consumeProxyDiagnosticStream(stream);
    const raw = structuredProxyLog(
      "ERROR",
      "The proxy has encountered a terminal error: unable to start: error initializing dialer: failed to create scoped credentials: password=secret",
    );
    stream.write(raw.slice(0, 41));
    stream.write(`${raw.slice(41)}\n`);
    stream.end();
    expect(summary.failureClass).toBe("PROXY_CREDENTIAL_SOURCE_FAILED");
    expect(summary.requestSubtype).toBeNull();
    expect(JSON.stringify(summary)).not.toContain("password=secret");
    expect(JSON.stringify(summary)).not.toContain(raw);
  });

  it("reports Proxy early exit with bounded metadata and no raw diagnostic", async () => {
    const result = await runFailure(async () => {
      await awaitProxyReadiness(
        { exitCode: 17, signalCode: null },
        { failed: false },
        [{
          observedBytes: 32,
          truncated: false,
          failureClass: "PROXY_SQLADMIN_PERMISSION_DENIED",
          requestSubtype: null,
        }],
        readinessDependencies([0, 1]),
      );
    });
    expect(result).toEqual({
      status: 1,
      stderr:
        '{"ok":false,"code":"PROXY_EARLY_EXIT","proxyExitCode":17,"proxySignal":null,"proxyDiagnosticAvailable":true,"proxyFailureClass":"PROXY_SQLADMIN_PERMISSION_DENIED"}\n',
    });
  });

  it("emits only allowlisted SQL Admin subtype fields on Proxy early exit", async () => {
    const stream = new PassThrough();
    const summary = consumeProxyDiagnosticStream(stream);
    const raw = structuredProxyLog("ERROR", sqlAdminRequestMessage(metadataUrlError(
      "credentials: cannot fetch token: token-like-value query=secret",
    )));
    stream.end(`${raw}\n`);
    const result = await runFailure(async () => {
      await awaitProxyReadiness(
        { exitCode: 1, signalCode: null },
        { failed: false },
        [summary],
        readinessDependencies([0, 1]),
      );
    });
    expect(result.stderr).toBe(
      '{"ok":false,"code":"PROXY_EARLY_EXIT","proxyExitCode":1,"proxySignal":null,"proxyDiagnosticAvailable":true,"proxyFailureClass":"PROXY_SQLADMIN_REQUEST_FAILED","requestPhase":"INSTANCE_METADATA","host":"sqladmin.googleapis.com","transportClass":"TOKEN"}\n',
    );
    expect(result.stderr).not.toContain("token-like-value");
    expect(result.stderr).not.toContain("connectSettings");
    expect(result.stderr).not.toContain("?");
    expect(result.stderr).not.toContain(raw);
  });

  it("keeps unknown structured errors nested under an unclassified early exit", async () => {
    const result = await runFailure(async () => {
      await awaitProxyReadiness(
        { exitCode: 1, signalCode: null },
        { failed: false },
        [{ observedBytes: 24, truncated: false, failureClass: null, requestSubtype: null }],
        readinessDependencies([0, 1]),
      );
    });
    expect(result.stderr).toBe(
      '{"ok":false,"code":"PROXY_EARLY_EXIT","proxyExitCode":1,"proxySignal":null,"proxyDiagnosticAvailable":true,"proxyFailureClass":"PROXY_EARLY_EXIT_UNCLASSIFIED"}\n',
    );
  });

  it("reports Proxy start failure independently", async () => {
    const result = await runFailure(async () => {
      await awaitProxyReadiness(
        { exitCode: null, signalCode: null },
        { failed: true },
        [],
        readinessDependencies([0, 1]),
      );
    });
    expect(result.stderr).toBe('{"ok":false,"code":"PROXY_START_FAILED"}\n');
  });

  it("reports the unchanged readiness deadline independently", async () => {
    const result = await runFailure(async () => {
      await awaitProxyReadiness(
        { exitCode: null, signalCode: null },
        { failed: false },
        [],
        readinessDependencies([0, 120_000]),
      );
    });
    expect(result.stderr).toBe('{"ok":false,"code":"PROXY_READY_TIMEOUT"}\n');
  });

  it("classifies database connect failure without leaking its exception", async () => {
    const result = await runFailure(() => requireDatabaseConnection(
      rejectSensitiveDiagnostic,
    ));
    expect(result.stderr).toBe('{"ok":false,"code":"DB_CONNECT_FAILED"}\n');
    expect(result.stderr).not.toContain(SENSITIVE_DIAGNOSTIC);
  });

  it.each(["check", "apply"] as const)(
    "retains Proxy ownership through pending and fulfilled %s database work",
    async (mode) => {
      const work = deferred<string>();
      const events: string[] = [];
      const stopProxy = vi.fn(() => {
        events.push("proxy-stopped");
        return Promise.resolve();
      });
      const result = retainProxyThroughDatabaseWork({
        awaitReadiness: () => {
          events.push("proxy-ready");
          return Promise.resolve();
        },
        databaseWork: async () => {
          events.push(`${mode}-started`);
          const value = await work.promise;
          events.push(`${mode}-fulfilled`);
          return value;
        },
        stopProxy,
      });

      await vi.waitFor(() => {
        expect(events).toEqual(["proxy-ready", `${mode}-started`]);
      });
      expect(stopProxy).not.toHaveBeenCalled();

      work.resolve(`${mode}-result`);
      await expect(result).resolves.toBe(`${mode}-result`);
      expect(events).toEqual([
        "proxy-ready",
        `${mode}-started`,
        `${mode}-fulfilled`,
        "proxy-stopped",
      ]);
      expect(stopProxy).toHaveBeenCalledOnce();
    },
  );

  it.each(["check", "apply"] as const)(
    "stops Proxy once after rejected %s database work reaches the safe boundary",
    async (mode) => {
      const work = deferred<void>();
      const stopProxy = vi.fn(() => Promise.resolve());
      const databaseWork = vi.fn(async () => {
        await requireDatabaseConnection(() => work.promise);
        return Object.freeze({});
      });
      const output = outputSink();
      const result = runDatabaseBootstrapEntrypoint(
        [mode],
        VALID_ENV,
        output,
        dependencies(() => retainProxyThroughDatabaseWork({
          awaitReadiness: () => Promise.resolve(),
          databaseWork,
          stopProxy,
        })),
      );

      await vi.waitFor(() => {
        expect(databaseWork).toHaveBeenCalledOnce();
        expect(stopProxy).not.toHaveBeenCalled();
      });
      work.reject(new Error(SENSITIVE_DIAGNOSTIC));

      await expect(result).resolves.toBe(1);
      expect(stopProxy).toHaveBeenCalledOnce();
      expect(output.stderrLines).toEqual([
        '{"ok":false,"code":"DB_CONNECT_FAILED"}\n',
      ]);
      expect(output.stderrLines.join("")).not.toContain(SENSITIVE_DIAGNOSTIC);
    },
  );

  it("preserves a classified database failure when Proxy shutdown also rejects", async () => {
    const stopProxy = vi.fn(() => Promise.reject(new Error("raw shutdown failure")));
    const output = outputSink();
    const result = await runDatabaseBootstrapEntrypoint(
      ["check"],
      VALID_ENV,
      output,
      dependencies(() => retainProxyThroughDatabaseWork({
        awaitReadiness: () => Promise.resolve(),
        databaseWork: async () => {
          await requireDatabaseConnection(rejectSensitiveDiagnostic);
          return Object.freeze({});
        },
        stopProxy,
      })),
    );

    expect(result).toBe(1);
    expect(stopProxy).toHaveBeenCalledOnce();
    expect(output.stderrLines).toEqual([
      '{"ok":false,"code":"DB_CONNECT_FAILED"}\n',
    ]);
    expect(output.stderrLines.join("")).not.toContain(SENSITIVE_DIAGNOSTIC);
    expect(output.stderrLines.join("")).not.toContain("raw shutdown failure");
  });

  it("reports a cleanup failure after fulfilled database work", async () => {
    const stopProxy = vi.fn(() => Promise.reject(new Error("raw shutdown failure")));
    const output = outputSink();
    const result = await runDatabaseBootstrapEntrypoint(
      ["check"],
      VALID_ENV,
      output,
      dependencies(() => retainProxyThroughDatabaseWork({
        awaitReadiness: () => Promise.resolve(),
        databaseWork: () => Promise.resolve(Object.freeze({ mode: "check" })),
        stopProxy,
      })),
    );

    expect(result).toBe(1);
    expect(stopProxy).toHaveBeenCalledOnce();
    expect(output.stderrLines).toEqual([
      '{"ok":false,"code":"RUNTIME_LOCAL_FAILED"}\n',
    ]);
    expect(output.stderrLines.join("")).not.toContain("raw shutdown failure");
  });

  it("classifies ledger query failure independently", async () => {
    const result = await runFailure(() => requireLedgerRead(
      rejectLedgerDiagnostic,
    ));
    expect(result.stderr).toBe('{"ok":false,"code":"LEDGER_READ_FAILED"}\n');
    expect(result.stderr).not.toContain("raw ledger query failure");
  });

  it("classifies semantic ledger rejection independently", async () => {
    const inventory = await loadRefundWorkerMigrationInventory();
    const result = await runFailure(() => {
      requireExactLedgerRows([{
        migrationName: "unexpected",
        checksum: "c".repeat(64),
        finishedAt: new Date(0),
        rolledBackAt: null,
      }], inventory);
    });
    expect(result.stderr).toBe('{"ok":false,"code":"LEDGER_REJECTED"}\n');
  });

  it("keeps check read-only, grant-only migration-free, apply ordering unchanged, and retries absent", () => {
    const source = readFileSync(
      join(ROOT, "containers/refund-db-bootstrap/entrypoint.ts"),
      "utf8",
    );
    const check = source.slice(
      source.indexOf("async function checkDatabase"),
      source.indexOf("async function applyCanaryRoleGrants"),
    );
    const apply = source.slice(
      source.indexOf("async function applyDatabase"),
      source.indexOf("async function requireExactMigrationPrefix"),
    );
    const grantOnly = source.slice(
      source.indexOf("async function applyCanaryRoleGrants"),
      source.indexOf("async function applyDatabase"),
    );
    expect(check.match(/requireDatabaseConnection/gu)).toHaveLength(1);
    expect(check).not.toMatch(/migrate|ROLE_BOOTSTRAP|INSERT|UPDATE|DELETE/iu);
    expect(apply.match(/requireDatabaseConnection/gu)).toHaveLength(2);
    expect(apply.indexOf("requireExactMigrationPrefix")).toBeLessThan(
      apply.indexOf("PRISMA_EXECUTABLE"),
    );
    expect(apply.lastIndexOf("requireExactMigrationPrefix")).toBeLessThan(
      apply.indexOf("ROLE_BOOTSTRAP_EXECUTABLE"),
    );
    expect(grantOnly).toContain("applyEximbayP3eCanaryRoleGrants");
    expect(grantOnly).toContain("requireExactMigrationPrefix");
    expect(grantOnly).not.toMatch(
      /PRISMA_EXECUTABLE|ROLE_BOOTSTRAP_EXECUTABLE|materializeApplicationCredential|recoverCanaryApplicationCredential|RestSecretMetadataClient/iu,
    );
    expect(grantOnly).toContain("businessRowMutation: false");
    expect(grantOnly).toContain("secretManagerEffects: 0");
    expect(grantOnly).toContain("providerEffects: 0");
    expect(source).not.toMatch(/retryDatabase|connectWithRetry|databaseRetry/iu);
    const owner = source.slice(
      source.indexOf("export async function retainProxyThroughDatabaseWork"),
      source.indexOf("async function checkDatabase"),
    );
    expect(owner).toContain("return await dependencies.databaseWork()");
    expect(owner.indexOf("return await dependencies.databaseWork()")).toBeLessThan(
      owner.indexOf("await dependencies.stopProxy().catch"),
    );
  });

  it("freezes the small evidence-bounded stage vocabulary", () => {
    expect(BOOTSTRAP_FAILURE_CODES).toEqual([
      "PROXY_START_FAILED",
      "PROXY_EARLY_EXIT",
      "PROXY_READY_TIMEOUT",
      "DB_CONNECT_FAILED",
      "LEDGER_READ_FAILED",
      "LEDGER_REJECTED",
      "RUNTIME_LOCAL_FAILED",
      "SYNTHETIC_SALE_MARKET_PRECONDITION_CONFLICT",
      "SECRET_METADATA_UNAVAILABLE",
      "SECRET_VERSION_BASELINE_DRIFT",
      "APPLICATION_PASSWORD_TRANSACTION_FAILED",
      "APPLICATION_PASSWORD_LOGIN_FAILED",
      "SECRET_VERSION_ADD_FAILED",
      "SECRET_VERSION_ADD_AMBIGUOUS_ZERO",
      "SECRET_VERSION_ADD_AMBIGUOUS_ONE",
      "SECRET_VERSION_ADD_AMBIGUOUS_DRIFT",
      "SECRET_VERSION_POSTCONDITION_FAILED",
    ]);
    expect(contract.diagnostics).toEqual({
      proxyOutput: "BOUNDED_METADATA_ONLY_RAW_CONTENT_NEVER_EMITTED",
      proxyDiagnosticByteLimit: 4096,
      proxyStructuredLogSchema: ["timestamp", "severity", "message"],
      proxyFailureClasses: [...PROXY_FAILURE_CLASSES],
      sqlAdminRequestPhase: "INSTANCE_METADATA",
      sqlAdminRequestHost: "sqladmin.googleapis.com",
      proxyTransportClasses: [...PROXY_TRANSPORT_CLASSES],
      temporarySignal: "OMITTED_UPSTREAM_TYPED_SIGNAL_FLATTENED",
      databaseConnectionRetries: 0,
      stageCodes: [...BOOTSTRAP_FAILURE_CODES],
    });
  });

  it("freezes the exact three-resource dormant migration identity", () => {
    expect(contract.status).toBe("SOURCE_DEFINED_AUTHORITY_RETIREMENT_TARGET");
    expect(contract.resourceGraph).toEqual({
      resourceCount: 3,
      addresses: [
        "google_cloud_run_v2_job.bootstrap",
        "google_service_account.bootstrap",
        "google_sql_user.bootstrap",
      ],
      sortedAddressSha256:
        "ae5f085000d7a0d7e50380eb3c5451ae473f24c63ab0fce5a7ef1ee21adb9c22",
      temporaryAuthorizedResourceCount: 5,
      temporaryAuthorizedAddresses: [
        "google_cloud_run_v2_job.bootstrap",
        'google_project_iam_member.cloud_sql_access["client"]',
        'google_project_iam_member.cloud_sql_access["instance_user"]',
        "google_service_account.bootstrap",
        "google_sql_user.bootstrap",
      ],
      temporaryAuthorizedSortedAddressSha256:
        "c25d113c45d1bdbf96e30eda1f73914c2291946e0d012cf13d4345aad335a472",
    });
    expect(contract.iam.roles).toEqual([]);
    expect(contract.iam.temporaryCloudSqlAccessDefault).toBe(false);
    expect(contract.iam.temporaryAuthorizedRoles).toEqual([
      "roles/cloudsql.client",
      "roles/cloudsql.instanceUser",
    ]);
    expect(contract.iam.credentialSecretScope).toEqual([]);
    expect(contract.iam.credentialSecretRoles).toEqual([]);
    expect(contract.iam.cloudSqlLoginAuthority).toBe("NONE");
    expect(contract.iam.credentialSecretIamAuthority).toBe("NONE");
    expect(contract.iam.futureMigrationReentry).toBe(
      "SEPARATELY_AUTHORIZED_DEFAULT_FALSE_INPUT_TRUE_REQUIRED",
    );
    expect(contract.identity.databaseRoles).toEqual(["cloudsqlsuperuser"]);
    expect(contract.job.executionStatus).toBe("RETAINED_DORMANT_NO_AUTOMATIC_TRIGGER");
    expect(contract.boundaries.secretVersions).toEqual({
      preflight: 1,
      canary: 1,
      mutation: 0,
    });
    const main = readFileSync(join(
      ROOT,
      "infra/refund-sandbox/p3e-b2/database-bootstrap/main.tf",
    ), "utf8");
    const locals = readFileSync(join(
      ROOT,
      "infra/refund-sandbox/p3e-b2/database-bootstrap/locals.tf",
    ), "utf8");
    const variables = readFileSync(join(
      ROOT,
      "infra/refund-sandbox/p3e-b2/database-bootstrap/variables.tf",
    ), "utf8");
    const cloudSqlIam = main.slice(
      main.indexOf('resource "google_project_iam_member" "cloud_sql_access"'),
      main.indexOf('resource "google_sql_user" "bootstrap"'),
    );
    const sqlUser = main.slice(
      main.indexOf('resource "google_sql_user" "bootstrap"'),
      main.indexOf('resource "google_secret_manager_secret_iam_member"'),
    );
    const serviceAccount = main.slice(
      main.indexOf('resource "google_service_account" "bootstrap"'),
      main.indexOf('resource "google_project_iam_member"'),
    );
    const job = main.slice(main.indexOf('resource "google_cloud_run_v2_job" "bootstrap"'));
    expect(main.match(/^resource\s+"/gmu)).toHaveLength(5);
    expect(main).not.toMatch(/service_account_key|run_invoker|scheduler|eventarc/iu);
    expect(main).not.toContain("roles/secretmanager.secretAccessor");
    expect(main).toContain("google_secret_manager_secret_iam_member");
    expect(main).not.toContain("roles/cloudsql.admin");
    expect(main).toMatch(/database_roles\s+=\s+\["cloudsqlsuperuser"\]/u);
    expect(main).toContain("args  = [var.bootstrap_mode]");
    expect(main).toContain('max_retries           = 0');
    expect(locals).toContain(
      "cloud_sql_roles = var.temporary_cloud_sql_access_authorized ? {",
    );
    expect(variables).toMatch(
      /variable "temporary_cloud_sql_access_authorized"[\s\S]+default\s+= false/u,
    );
    expect(variables).toMatch(
      /variable "bootstrap_mode"[\s\S]+default\s+= "check"[\s\S]+contains\(\[[\s\S]+"check"[\s\S]+"apply-contacted-reconciliation-role-grants"[\s\S]+"restore-canary-refund-role-grants"[\s\S]+\], var\.bootstrap_mode\)/u,
    );
    expect(variables).not.toMatch(
      /variable\s+"[^"]*(?:command|args|override|environment)[^"]*"/iu,
    );
    expect(variables).not.toMatch(/type\s*=\s*list\(string\)/u);
    expect(job).not.toMatch(/\bcommand\s*=/u);
    expect(main).not.toMatch(/google_cloud_run_v2_job_execution|null_resource|local-exec/iu);
    expect(cloudSqlIam).not.toContain("prevent_destroy");
    expect(serviceAccount).toContain("prevent_destroy = true");
    expect(sqlUser).toContain("prevent_destroy = true");
    expect(job).toContain("prevent_destroy = true");
  });

  it("keeps the image purpose-specific and provider-credential free", () => {
    const packageSource = readFileSync(
      join(ROOT, "containers/refund-db-bootstrap/package.json"),
      "utf8",
    );
    const dockerfile = readFileSync(
      join(ROOT, "containers/refund-db-bootstrap/Dockerfile"),
      "utf8",
    );
    expect(packageSource).not.toMatch(/toss|aws|secret-manager|next/iu);
    expect(dockerfile).toContain("RUN npm ci --legacy-peer-deps");
    expect(dockerfile).toContain('CMD ["check"]');
    expect(dockerfile).toContain("scripts/eximbay-p3e-database-bootstrap.ts");
    expect(dockerfile).toContain("COPY --link prisma ./prisma");
    expect(dockerfile).toContain(
      "COPY --link --from=proxy /etc/ssl/certs/ca-certificates.crt "
      + "/etc/ssl/certs/ca-certificates.crt",
    );
    expect(dockerfile.match(/ca-certificates\.crt/gu)).toHaveLength(2);
    expect(dockerfile).not.toMatch(/ENV\s+(?:SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS)/u);
    expect(dockerfile).not.toContain("refund-worker/Dockerfile");
    expect(contract.image.systemCaTrust).toEqual({
      sourceStage: "PINNED_CLOUD_SQL_PROXY_IMAGE",
      sourcePath: "/etc/ssl/certs/ca-certificates.crt",
      runtimePath: "/etc/ssl/certs/ca-certificates.crt",
      runtimeUid: 65532,
      runtimeGid: 65532,
      requiredType: "REGULAR_FILE",
      requiredNonempty: true,
      requiredReadable: true,
      sslRootOverride: "NONE",
    });
  });

  it("binds the exact 41-migration corpus", async () => {
    const inventory = await loadRefundWorkerMigrationInventory();
    expect(inventory).toMatchObject({
      migrationCount: 41,
      migrationDigest:
        "4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c",
    });
    expect(inventory.entries.at(-1)?.name).toBe(
      "20260827090000_add_checkout_communication_locale",
    );
  });

  it("binds the built entrypoint to the packaged migration location", () => {
    const entrypoint = readFileSync(
      join(ROOT, "containers/refund-db-bootstrap/entrypoint.ts"),
      "utf8",
    );
    const verifier = readFileSync(
      join(ROOT, "scripts/verify-refund-db-bootstrap-image.mts"),
      "utf8",
    );
    expect(entrypoint).toContain('MIGRATIONS_DIRECTORY = "/app/prisma/migrations"');
    expect(entrypoint).toContain("loadRefundWorkerMigrationInventory(MIGRATIONS_DIRECTORY)");
    expect(verifier).toContain("defaultRuntimeDependencies.loadMigrationInventory()");
    expect(verifier).toContain('CA_BUNDLE_PATH = "/etc/ssl/certs/ca-certificates.crt"');
    expect(verifier).toContain('"--network=none"');
    expect(verifier).toContain("process.getuid()");
    expect(verifier).toContain("process.env.SSL_CERT_FILE ?? null");
  });
});

function dependencies(execute: RuntimeDependencies["execute"]): RuntimeDependencies {
  return Object.freeze({
    readSourceCommit: () => Promise.resolve(`${COMMIT}\n`),
    loadMigrationInventory: () => loadRefundWorkerMigrationInventory(),
    execute,
  });
}

function executeMock(
  result: Readonly<Record<string, unknown>> = Object.freeze({}),
) {
  return vi.fn((
    _configuration: RuntimeConfiguration,
    _inventory: RefundWorkerMigrationInventory,
  ): Promise<Readonly<Record<string, unknown>>> => Promise.resolve(result));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function outputSink() {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    stdoutLines,
    stderrLines,
    stdout: { write: (value: string) => { stdoutLines.push(value); return true; } },
    stderr: { write: (value: string) => { stderrLines.push(value); return true; } },
  };
}

function structuredProxyLog(severity: "DEBUG" | "INFO" | "ERROR", message: string): string {
  return JSON.stringify({
    timestamp: "2026-08-30T16:42:31Z",
    severity,
    message,
  });
}

function sqlAdminRequestMessage(failure: string): string {
  return "[mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18] "
    + "could not resolve instance version: failed to get instance: refresh error: "
    + "failed to get instance metadata (connection name = "
    + "\"mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18\"): "
    + failure;
}

function metadataUrlError(cause: string): string {
  return "Get \"https://sqladmin.googleapis.com/sql/v1beta4/projects/"
    + "mira-refund-sandbox-0001/instances/mira-p3e-sbx-refund-pg18/connectSettings"
    + "?alt=json&prettyPrint=false\": "
    + cause;
}

function sqlAdminRequestDetails(failure: string) {
  return classifyProxyStructuredLogLineDetails(
    structuredProxyLog("ERROR", sqlAdminRequestMessage(failure)),
  );
}

async function runFailure(action: () => void | Promise<void>) {
  const execute = vi.fn(async () => {
    await action();
    return Object.freeze({});
  });
  const output = outputSink();
  const status = await runDatabaseBootstrapEntrypoint(
    ["check"],
    VALID_ENV,
    output,
    dependencies(execute),
  );
  return Object.freeze({ status, stderr: output.stderrLines.join("") });
}

function readinessDependencies(nowValues: readonly number[]) {
  let nowIndex = 0;
  return Object.freeze({
    now: () => nowValues[nowIndex++] ?? nowValues.at(-1) ?? 0,
    fetchReadiness: () => Promise.resolve(false),
    wait: () => Promise.resolve(),
  });
}

function rejectSensitiveDiagnostic(): Promise<void> {
  return Promise.reject(new Error(SENSITIVE_DIAGNOSTIC));
}

function rejectLedgerDiagnostic(): Promise<void> {
  return Promise.reject(new Error("raw ledger query failure"));
}

function deferred<Result>() {
  let resolve!: (value: Result) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Result>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return Object.freeze({ promise, resolve, reject });
}
