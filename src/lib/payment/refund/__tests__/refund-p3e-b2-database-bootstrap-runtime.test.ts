import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import contract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/database-bootstrap-runtime-v1.json";
import {
  proxyArguments,
  runDatabaseBootstrapEntrypoint,
  type RuntimeConfiguration,
  type RuntimeDependencies,
} from "../../../../../containers/refund-db-bootstrap/entrypoint";
import {
  loadRefundWorkerMigrationInventory,
  type RefundWorkerMigrationInventory,
} from "../worker-migration-inventory";

const ROOT = process.cwd();
const COMMIT = "a".repeat(40);
const DIGEST = "b".repeat(64);
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

  it("freezes the private automatic-IAM proxy vector", () => {
    expect(proxyArguments()).toEqual([
      "--private-ip",
      "--auto-iam-authn",
      "--unix-socket=/cloudsql",
      "--health-check",
      "--http-address=127.0.0.1",
      "--http-port=9801",
      "--exit-zero-on-sigterm",
      "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18",
    ]);
  });

  it("freezes the exact five-resource dormant Terraform authority", () => {
    expect(contract.resourceGraph).toEqual({
      resourceCount: 5,
      addresses: [
        "google_cloud_run_v2_job.bootstrap",
        'google_project_iam_member.cloud_sql_access["client"]',
        'google_project_iam_member.cloud_sql_access["instance_user"]',
        "google_service_account.bootstrap",
        "google_sql_user.bootstrap",
      ],
      sortedAddressSha256:
        "c25d113c45d1bdbf96e30eda1f73914c2291946e0d012cf13d4345aad335a472",
    });
    const main = readFileSync(join(
      ROOT,
      "infra/refund-sandbox/p3e-b2/database-bootstrap/main.tf",
    ), "utf8");
    expect(main.match(/^resource\s+"/gmu)).toHaveLength(4);
    expect(main).not.toMatch(/service_account_key|secret_manager|run_invoker|scheduler|eventarc/iu);
    expect(main).not.toContain("roles/cloudsql.admin");
    expect(main).toMatch(/database_roles\s+=\s+\["cloudsqlsuperuser"\]/u);
    expect(main).toContain('args  = ["check"]');
    expect(main).toContain('max_retries           = 0');
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
    expect(dockerfile).not.toContain("refund-worker/Dockerfile");
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
