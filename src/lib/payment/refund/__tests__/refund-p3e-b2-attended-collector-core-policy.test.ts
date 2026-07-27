import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import contract from "../../../../../infra/refund-sandbox/p3e-b2/contracts/attended-collector-core-v1.json";
import {
  buildTb2aAttendedEnvironment,
  tb2aCredentialBearingEnvironmentPresent,
  TB2A_CLOSE_DEADLINE_MS,
  TB2A_SIGTERM_GRACE_MS,
  validTb2aAttendedEnvironment,
  validateTb2aExecutableBoundary,
} from "../../../../../scripts/refund-p3e-b2-bootstrap-readiness-adapter.mjs";
import {
  TB2A_AUTOMATIC_RETRIES,
  TB2A_COMMAND_KINDS,
  TB2A_MAX_ATTEMPTS,
  TB2A_MAX_RETRIES,
  TB1_COMMAND_TIMEOUT_MS,
} from "../../../../../scripts/refund-p3e-b2-bootstrap-readiness.mjs";

const ROOT = process.cwd();

describe("P3E-B2 TB2A attended collector core policy", () => {
  it("grants exactly two project-scoped read permissions", () => {
    expect(contract.collectorPermissions).toEqual({
      included: [
        "resourcemanager.projects.get",
        "serviceusage.services.list",
      ],
      scope: "EXACT_DEDICATED_PROJECT_ONLY",
      excluded: [
        "serviceusage.services.get",
        "serviceusage.services.use",
        "serviceusage.services.batchGet",
        "consumer-policy mutation",
        "API activation",
        "billing mutation",
        "quota-project overrides",
      ],
    });
  });

  it("freezes six commands, one attempt, and no automatic retry", () => {
    expect(contract.commandOrder).toEqual(TB2A_COMMAND_KINDS);
    expect(contract.attempts).toMatchObject({
      maxAttempts: TB2A_MAX_ATTEMPTS,
      maxRetries: TB2A_MAX_RETRIES,
      automaticRetries: TB2A_AUTOMATIC_RETRIES,
    });
    expect(contract.evidence.maxTotalDurationSeconds).toBe(120);
  });

  it("freezes the exact attended process timing authority", () => {
    expect(contract.processBoundary).toMatchObject({
      commandDeadlineMilliseconds: TB1_COMMAND_TIMEOUT_MS,
      sigtermGraceMilliseconds: TB2A_SIGTERM_GRACE_MS,
      closeDeadlineMilliseconds: TB2A_CLOSE_DEADLINE_MS,
    });
    expect([
      TB1_COMMAND_TIMEOUT_MS,
      TB2A_SIGTERM_GRACE_MS,
      TB2A_CLOSE_DEADLINE_MS,
    ]).toEqual([30_000, 2_000, 5_000]);
  });

  it("constructs only the reviewed environment with output explicitly enabled", () => {
    const environment = buildTb2aAttendedEnvironment({
      cloudSdkConfigPath: "/private/tmp/tb2a-config",
      configurationName: "attended-review",
      projectId: "mira-refund-sbx",
      pythonPath: "/private/tmp/tb2a-python",
      homePath: "/private/tmp/tb2a-home",
      temporaryPath: "/private/tmp/tb2a-tmp",
      path: "/usr/bin",
      utf8Locale: "C.UTF-8",
    });

    expect(validTb2aAttendedEnvironment(environment)).toBe(true);
    expect(Object.getPrototypeOf(environment)).toBeNull();
    expect(environment).toEqual({
      CLOUDSDK_CONFIG: "/private/tmp/tb2a-config",
      CLOUDSDK_ACTIVE_CONFIG_NAME: "attended-review",
      CLOUDSDK_CORE_PROJECT: "mira-refund-sbx",
      CLOUDSDK_PYTHON: "/private/tmp/tb2a-python",
      CLOUDSDK_CORE_DISABLE_PROMPTS: "1",
      CLOUDSDK_CORE_DISABLE_USAGE_REPORTING: "true",
      CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK: "true",
      CLOUDSDK_CORE_DISABLE_FILE_LOGGING: "true",
      CLOUDSDK_CORE_DISABLE_COLOR: "true",
      CLOUDSDK_CORE_USER_OUTPUT_ENABLED: "true",
      CLOUDSDK_CORE_VERBOSITY: "none",
      HOME: "/private/tmp/tb2a-home",
      TMPDIR: "/private/tmp/tb2a-tmp",
      PATH: "/usr/bin",
      TERM: "dumb",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      NODE_ENV: "production",
    });
    expect(environment).not.toHaveProperty("GOOGLE_APPLICATION_CREDENTIALS");
    expect(environment).not.toHaveProperty("GOOGLE_CLOUD_QUOTA_PROJECT");
    expect(environment).not.toHaveProperty("HTTP_PROXY");
    expect(environment).not.toHaveProperty("NODE_OPTIONS");
    expect(environment).not.toHaveProperty("PYTHONPATH");
  });

  it("rejects disabled user output because the parser requires stdout", () => {
    const environment = {
      ...buildTb2aAttendedEnvironment({
        cloudSdkConfigPath: "/private/tmp/tb2a-config",
        configurationName: "attended-review",
        projectId: "mira-refund-sbx",
        pythonPath: "/private/tmp/tb2a-python",
        homePath: "/private/tmp/tb2a-home",
        temporaryPath: "/private/tmp/tb2a-tmp",
        path: "/usr/bin",
        utf8Locale: "C.UTF-8",
      }),
      CLOUDSDK_CORE_USER_OUTPUT_ENABLED: "false",
    };

    expect(validTb2aAttendedEnvironment(environment)).toBe(false);
  });

  it.each([
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_CLOUD_QUOTA_PROJECT",
    "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE",
    "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
    "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
    "CLOUDSDK_BILLING_QUOTA_PROJECT",
    "CLOUDSDK_API_ENDPOINT_OVERRIDES_STORAGE",
    "CLOUDSDK_PROXY_ADDRESS",
  ])("detects credential or redirection environment %s", (name) => {
    expect(tb2aCredentialBearingEnvironmentPresent({
      [name]: "private-value",
    })).toBe(true);
  });

  it("does not classify unrelated empty environment as credential-bearing", () => {
    expect(tb2aCredentialBearingEnvironmentPresent({
      PATH: "/usr/bin",
      GOOGLE_APPLICATION_CREDENTIALS: "",
      NODE_OPTIONS: undefined,
    })).toBe(false);
  });

  it("admits separately supplied regular executable launcher and interpreter", async () => {
    await withExecutableFixture(async ({ launcher, python }) => {
      expect(await validateTb2aExecutableBoundary({
        launcherPath: launcher,
        pythonPath: python,
        repositoryRoot: ROOT,
      })).toEqual({
        ok: true,
        launcherPath: realpathSync(launcher),
        pythonPath: realpathSync(python),
      });
    });
  });

  it("rejects a symlink launcher before canonical-path admission", async () => {
    await withExecutableFixture(async ({ directory, launcher, python }) => {
      const symlink = join(directory, "gcloud-link");
      symlinkSync(launcher, symlink);
      expect(await validateTb2aExecutableBoundary({
        launcherPath: symlink,
        pythonPath: python,
        repositoryRoot: ROOT,
      })).toEqual({
        ok: false,
        reason: "EXECUTABLE_BOUNDARY_REJECTED",
      });
    });
  });

  it("rejects group/world-writable executable material", async () => {
    await withExecutableFixture(async ({ launcher, python }) => {
      chmodSync(python, 0o722);
      expect(await validateTb2aExecutableBoundary({
        launcherPath: launcher,
        pythonPath: python,
        repositoryRoot: ROOT,
      })).toEqual({
        ok: false,
        reason: "EXECUTABLE_BOUNDARY_REJECTED",
      });
    });
  });

  it("rejects launcher material contained within the repository", async () => {
    await withExecutableFixture(async ({ python }) => {
      expect(await validateTb2aExecutableBoundary({
        launcherPath: join(
          ROOT,
          "src/lib/payment/refund/__tests__/fixtures/"
            + "refund-p3e-b2-child-fixture.mjs",
        ),
        pythonPath: python,
        repositoryRoot: ROOT,
      })).toEqual({
        ok: false,
        reason: "EXECUTABLE_BOUNDARY_REJECTED",
      });
    });
  });

  it("records the executing-UID and effective-caller limitations", () => {
    expect(contract.executableBoundary).toMatchObject({
      executingUidAttackerProtection: "NOT_CLAIMED",
    });
    expect(contract.evidence).toMatchObject({
      reviewer: "ABSENT_REQUIRED",
      downstreamAuthority: "ALL_FALSE",
    });
  });

  it("admits only the exact adapter import set and no network-capable loader", () => {
    const adapterPath = join(
      ROOT,
      "scripts/refund-p3e-b2-bootstrap-readiness-adapter.mts",
    );
    const source = readFileSync(adapterPath, "utf8");
    const parsed = ts.createSourceFile(
      adapterPath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const imports = parsed.statements
      .filter(ts.isImportDeclaration)
      .map((declaration) => declaration.moduleSpecifier)
      .filter(ts.isStringLiteral)
      .map((specifier) => specifier.text)
      .sort();

    expect(imports).toEqual([
      "./refund-p3e-b2-bootstrap-readiness.mjs",
      "node:child_process",
      "node:events",
      "node:fs",
      "node:fs/promises",
      "node:path",
      "node:stream",
      "node:url",
      "node:util",
    ]);
    const eventsImport = parsed.statements
      .filter(ts.isImportDeclaration)
      .find((declaration) => (
        ts.isStringLiteral(declaration.moduleSpecifier)
        && declaration.moduleSpecifier.text === "node:events"
      ));
    expect(eventsImport?.importClause?.isTypeOnly).toBe(true);
    expect(runtimeLoaderNames(parsed)).toEqual([]);
    expect(source).not.toContain("missing-executable");
    expect(source.match(/process\.execPath/gu)).toHaveLength(1);
    expect(readFileSync(
      join(ROOT, "scripts/refund-p3e-b2-collector-selfcheck.mts"),
      "utf8",
    )).not.toContain("process.execPath");
  });
});

async function withExecutableFixture(
  run: (fixture: Readonly<{
    directory: string;
    launcher: string;
    python: string;
  }>) => Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "mira-tb2a-executable-"));
  chmodSync(directory, 0o700);
  const launcher = join(directory, "gcloud");
  const python = join(directory, "python");
  writeExecutable(launcher);
  writeExecutable(python);
  try {
    await run({ directory, launcher, python });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function writeExecutable(path: string): void {
  writeFileSync(path, "#!/nonexistent\n", { mode: 0o700 });
}

function runtimeLoaderNames(source: ts.SourceFile): string[] {
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        names.push("dynamic import");
      } else if (ts.isIdentifier(node.expression)
        && (
          node.expression.text === "fetch"
          || node.expression.text === "require"
        )) {
        names.push(node.expression.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}
