import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_SEED_ACKNOWLEDGEMENT_PREFIX,
  type DemoSeedPgConfig,
  type DemoSeedPrismaPgOptions,
} from "../../prisma/demo-seed-guard";
import { runDemoCatalogSeed, type DemoSeedRuntime } from "../../prisma/seed";

const ROOT = process.cwd();
const DEMO_DATABASE = "wig_platform_demo";
const DEMO_USERNAME = "demo_user";
const DEMO_HOSTNAME = "localhost";
const DEMO_PASSWORD = "demo-password-must-never-appear";
const DEMO_DATABASE_URL =
  `postgresql://${DEMO_USERNAME}:${DEMO_PASSWORD}@${DEMO_HOSTNAME}/${DEMO_DATABASE}?schema=public`;
const DEMO_TARGET =
  `postgresql://${DEMO_USERNAME}@${DEMO_HOSTNAME}:5432/${DEMO_DATABASE}?schema=public`;

afterEach(() => vi.unstubAllEnvs());

describe("demo catalog seed containment", () => {
  it("rejects missing and malformed acknowledgements before database construction", async () => {
    for (const acknowledgement of [undefined, "yes", acknowledgementFor("stale")]) {
      const fixture = runtimeFixture();
      await expect(runDemoCatalogSeed(
        permittedEnvironment({ MIRA_DEMO_SEED_ACKNOWLEDGEMENT: acknowledgement }),
        fixture.runtime,
      )).rejects.toThrow(/DEMO_SEED_ACKNOWLEDGEMENT/u);
      expect(fixture.connect).not.toHaveBeenCalled();
      expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["NODE_ENV", { NODE_ENV: "production" }],
    ["VERCEL_ENV", { VERCEL_ENV: "Production" }],
    ["PAYMENT_MODE", { PAYMENT_MODE: " LIVE " }],
  ])("rejects the %s production posture before database construction", async (_name, posture) => {
    const fixture = runtimeFixture();
    await expect(runDemoCatalogSeed(
      permittedEnvironment(posture),
      fixture.runtime,
    )).rejects.toThrow("DEMO_SEED_PRODUCTION_POSTURE_REJECTED");
    expect(fixture.connect).not.toHaveBeenCalled();
    expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();
  });

  it("rejects missing or malformed expected database identity before construction", async () => {
    for (const expected of [undefined, " wrong database ", "wrong/database"]) {
      const fixture = runtimeFixture();
      await expect(runDemoCatalogSeed(
        permittedEnvironment({ MIRA_DEMO_SEED_EXPECTED_DATABASE: expected }),
        fixture.runtime,
      )).rejects.toThrow(/DEMO_SEED_EXPECTED_DATABASE/u);
      expect(fixture.connect).not.toHaveBeenCalled();
      expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-a-database-url"],
    ["wrong protocol", "mysql://localhost/wig_platform_demo"],
  ])("rejects a %s configured database URL before construction", async (_name, DATABASE_URL) => {
    const fixture = runtimeFixture();
    await expect(runDemoCatalogSeed(
      permittedEnvironment({ DATABASE_URL }),
      fixture.runtime,
    )).rejects.toThrow(/DEMO_SEED_DATABASE_URL/u);
    expect(fixture.connect).not.toHaveBeenCalled();
    expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();
  });

  it("rejects configured and acknowledged database mismatch before construction", async () => {
    const fixture = runtimeFixture();
    await expect(runDemoCatalogSeed(permittedEnvironment({
      DATABASE_URL: `postgresql://${DEMO_USERNAME}:${DEMO_PASSWORD}@localhost/another_demo`,
    }), fixture.runtime)).rejects.toThrow("DEMO_SEED_CONFIGURED_DATABASE_MISMATCH");
    expect(fixture.connect).not.toHaveBeenCalled();
    expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();
  });

  it("rejects the same database name on a different hostname", async () => {
    const fixture = runtimeFixture();
    const DATABASE_URL =
      `postgresql://${DEMO_USERNAME}:${DEMO_PASSWORD}@production-db.example.com/${DEMO_DATABASE}`;
    await expect(runDemoCatalogSeed(
      permittedEnvironment({ DATABASE_URL }),
      fixture.runtime,
    )).rejects.toThrow("DEMO_SEED_ACKNOWLEDGEMENT_MISMATCH");
    expect(fixture.connect).not.toHaveBeenCalled();
    expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();
  });

  it("rejects the same database and hostname on a different effective port", async () => {
    const fixture = runtimeFixture();
    const DATABASE_URL =
      `postgresql://${DEMO_USERNAME}:${DEMO_PASSWORD}@${DEMO_HOSTNAME}:5433/${DEMO_DATABASE}`;
    await expect(runDemoCatalogSeed(
      permittedEnvironment({ DATABASE_URL }),
      fixture.runtime,
    )).rejects.toThrow("DEMO_SEED_ACKNOWLEDGEMENT_MISMATCH");
    expect(fixture.connect).not.toHaveBeenCalled();
    expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();
  });

  it("rejects a different explicit username on the same host, port, and database", async () => {
    const fixture = runtimeFixture();
    const DATABASE_URL =
      `postgresql://another_user:${DEMO_PASSWORD}@${DEMO_HOSTNAME}/${DEMO_DATABASE}`;
    await expect(runDemoCatalogSeed(
      permittedEnvironment({ DATABASE_URL }),
      fixture.runtime,
    )).rejects.toThrow("DEMO_SEED_ACKNOWLEDGEMENT_MISMATCH");
    expect(fixture.connect).not.toHaveBeenCalled();
    expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();
  });

  it.each([
    ["omitted", DEMO_DATABASE_URL],
    ["explicit", `postgresql://${DEMO_USERNAME}:${DEMO_PASSWORD}@${DEMO_HOSTNAME}:5432/${DEMO_DATABASE}`],
  ])("normalizes the %s default PostgreSQL port deterministically", async (_name, DATABASE_URL) => {
    vi.stubEnv("PGPORT", "6543");
    const fixture = runtimeFixture();
    await expect(runDemoCatalogSeed(
      permittedEnvironment({ DATABASE_URL, PGPORT: "6543" }),
      fixture.runtime,
    )).resolves.toBeUndefined();
    expect(fixture.runDestructiveSeedBody).toHaveBeenCalledTimes(1);
  });

  it("keeps an explicit port exact under a hostile PGPORT", async () => {
    vi.stubEnv("PGPORT", "6543");
    const port = 5433;
    const DATABASE_URL =
      `postgresql://${DEMO_USERNAME}:${DEMO_PASSWORD}@${DEMO_HOSTNAME}:${port}/${DEMO_DATABASE}`;
    const fixture = runtimeFixture({ expectedPort: port });
    await expect(runDemoCatalogSeed(permittedEnvironment({
      DATABASE_URL,
      PGPORT: "6543",
      MIRA_DEMO_SEED_ACKNOWLEDGEMENT: acknowledgementFor(
        `postgresql://${DEMO_USERNAME}@${DEMO_HOSTNAME}:${port}/${DEMO_DATABASE}?schema=public`,
      ),
    }), fixture.runtime)).resolves.toBeUndefined();
    expect(fixture.runDestructiveSeedBody).toHaveBeenCalledTimes(1);
  });

  it("keeps explicit target fields exact under hostile PG target defaults", async () => {
    vi.stubEnv("PGHOST", "production-db.example.com");
    vi.stubEnv("PGPORT", "6543");
    vi.stubEnv("PGDATABASE", "production");
    vi.stubEnv("PGUSER", "production_user");
    const fixture = runtimeFixture();
    await expect(runDemoCatalogSeed(permittedEnvironment({
      PGHOST: "production-db.example.com",
      PGPORT: "6543",
      PGDATABASE: "production",
      PGUSER: "production_user",
    }), fixture.runtime)).resolves.toBeUndefined();
    expect(fixture.runDestructiveSeedBody).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["omitted", `postgresql://${DEMO_USERNAME}:${DEMO_PASSWORD}@${DEMO_HOSTNAME}/${DEMO_DATABASE}`],
    ["explicit public", DEMO_DATABASE_URL],
  ])("canonicalizes the %s schema form to the verified public namespace", async (
    _name,
    DATABASE_URL,
  ) => {
    const fixture = runtimeFixture();
    await expect(runDemoCatalogSeed(
      permittedEnvironment({ DATABASE_URL }),
      fixture.runtime,
    )).resolves.toBeUndefined();
    expect(fixture.runDestructiveSeedBody).toHaveBeenCalledTimes(1);
  });

  it("rejects a URL differing only by a non-public schema before construction", async () => {
    const fixture = runtimeFixture();
    const DATABASE_URL =
      `postgresql://${DEMO_USERNAME}:${DEMO_PASSWORD}@${DEMO_HOSTNAME}/${DEMO_DATABASE}?schema=private`;
    await expect(runDemoCatalogSeed(
      permittedEnvironment({ DATABASE_URL }),
      fixture.runtime,
    )).rejects.toThrow("DEMO_SEED_DATABASE_URL_INVALID");
    expect(fixture.connect).not.toHaveBeenCalled();
    expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();
  });

  it("rejects an omitted username before database construction", async () => {
    const DATABASE_URL = `postgresql://${DEMO_HOSTNAME}/${DEMO_DATABASE}`;
    const fixture = runtimeFixture();
    await expect(runDemoCatalogSeed(
      permittedEnvironment({ DATABASE_URL, PGUSER: DEMO_USERNAME }),
      fixture.runtime,
    )).rejects.toThrow("DEMO_SEED_DATABASE_URL_INVALID");
    expect(fixture.connect).not.toHaveBeenCalled();
    expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();
  });

  it("accepts canonical dotted-decimal IPv4 as the exact effective host", async () => {
    const hostname = "127.0.0.1";
    const DATABASE_URL =
      `postgresql://${DEMO_USERNAME}:${DEMO_PASSWORD}@${hostname}/${DEMO_DATABASE}`;
    const fixture = runtimeFixture({ expectedHost: hostname });
    await expect(runDemoCatalogSeed(permittedEnvironment({
      DATABASE_URL,
      MIRA_DEMO_SEED_ACKNOWLEDGEMENT: acknowledgementFor(
        `postgresql://${DEMO_USERNAME}@${hostname}:5432/${DEMO_DATABASE}?schema=public`,
      ),
    }), fixture.runtime)).resolves.toBeUndefined();
  });

  it("canonicalizes an ordinary DNS hostname deterministically", async () => {
    const DATABASE_URL =
      `postgresql://${DEMO_USERNAME}:${DEMO_PASSWORD}@LOCALHOST/${DEMO_DATABASE}`;
    const fixture = runtimeFixture();
    await expect(runDemoCatalogSeed(
      permittedEnvironment({ DATABASE_URL }),
      fixture.runtime,
    )).resolves.toBeUndefined();
  });

  it("rejects database-reported identity mismatch before the destructive body", async () => {
    const fixture = runtimeFixture({ reportedDatabase: "another_demo" });
    await expect(runDemoCatalogSeed(
      permittedEnvironment(),
      fixture.runtime,
    )).rejects.toThrow("DEMO_SEED_REPORTED_DATABASE_MISMATCH");
    expect(fixture.events).toEqual(["connect", "read-current-identity", "disconnect"]);
    expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();
  });

  it("rejects explicit configured username and current_user mismatch", async () => {
    const fixture = runtimeFixture({ currentUser: "another_user" });
    await expect(runDemoCatalogSeed(
      permittedEnvironment(),
      fixture.runtime,
    )).rejects.toThrow("DEMO_SEED_REPORTED_USERNAME_MISMATCH");
    expect(fixture.events).toEqual(["connect", "read-current-identity", "disconnect"]);
    expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();
  });

  it("rejects a non-public current_schema before the destructive body", async () => {
    const fixture = runtimeFixture({ currentSchema: "private" });
    await expect(runDemoCatalogSeed(
      permittedEnvironment(),
      fixture.runtime,
    )).rejects.toThrow("DEMO_SEED_REPORTED_SCHEMA_MISMATCH");
    expect(fixture.events).toEqual(["connect", "read-current-identity", "disconnect"]);
    expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();
  });

  it("reaches the destructive body only after exact full-target authorization", async () => {
    const fixture = runtimeFixture();
    await expect(runDemoCatalogSeed(permittedEnvironment(), fixture.runtime)).resolves.toBeUndefined();
    expect(fixture.events).toEqual([
      "connect",
      "read-current-identity",
      "run-destructive-seed-body",
      "disconnect",
    ]);
    expect(fixture.runDestructiveSeedBody).toHaveBeenCalledTimes(1);
  });

  it("keeps passwords and raw database URLs out of guard diagnostics", async () => {
    const rawDatabaseUrl =
      `postgresql://${DEMO_USERNAME}:${DEMO_PASSWORD}@${DEMO_HOSTNAME}/${DEMO_DATABASE}?host=forbidden`;
    const fixture = runtimeFixture();
    const failure = await runDemoCatalogSeed(
      permittedEnvironment({ DATABASE_URL: rawDatabaseUrl }),
      fixture.runtime,
    ).then(() => "UNEXPECTED_SUCCESS", errorMessage);

    expect(failure).toBe("DEMO_SEED_DATABASE_URL_INVALID");
    expect(failure).not.toContain(DEMO_PASSWORD);
    expect(failure).not.toContain(rawDatabaseUrl);
    expect(fixture.connect).not.toHaveBeenCalled();
    expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();

    const runDestructiveSeedBody = vi.fn(() => Promise.resolve());
    const leakingRuntime: DemoSeedRuntime = Object.freeze({
      connect() {
        return Object.freeze({
          readCurrentIdentity: () => Promise.reject(new Error(rawDatabaseUrl)),
          runDestructiveSeedBody,
          disconnect: () => Promise.resolve(),
        });
      },
    });
    const databaseFailure = await runDemoCatalogSeed(
      permittedEnvironment(),
      leakingRuntime,
    ).then(() => "UNEXPECTED_SUCCESS", errorMessage);

    expect(databaseFailure).toBe("DEMO_SEED_OPERATION_FAILED");
    expect(databaseFailure).not.toContain(DEMO_PASSWORD);
    expect(databaseFailure).not.toContain(rawDatabaseUrl);
    expect(runDestructiveSeedBody).not.toHaveBeenCalled();

    const acknowledgement = permittedEnvironment().MIRA_DEMO_SEED_ACKNOWLEDGEMENT;
    expect(acknowledgement).toBe(acknowledgementFor(DEMO_TARGET));
    expect(acknowledgement).not.toContain(DEMO_PASSWORD);
    expect(acknowledgement).toContain("schema=public");
  });

  it.each([
    ["endpoint override", `postgresql://${DEMO_USERNAME}:password@localhost/${DEMO_DATABASE}?host=%2Fcloudsql%2Finstance`],
    ["non-public schema", `postgresql://${DEMO_USERNAME}:password@localhost/${DEMO_DATABASE}?schema=private`],
    ["duplicate query", `postgresql://${DEMO_USERNAME}:password@localhost/${DEMO_DATABASE}?schema=public&schema=other`],
    ["fragment", `postgresql://${DEMO_USERNAME}:password@localhost/${DEMO_DATABASE}#other`],
    ["multi-host", `postgresql://${DEMO_USERNAME}:password@host-a,host-b/${DEMO_DATABASE}`],
    ["trailing-dot hostname", `postgresql://${DEMO_USERNAME}:password@example.com./${DEMO_DATABASE}`],
    ["IPv4 shorthand", `postgresql://${DEMO_USERNAME}:password@127.1/${DEMO_DATABASE}`],
    ["integer IPv4", `postgresql://${DEMO_USERNAME}:password@2130706433/${DEMO_DATABASE}`],
    ["hexadecimal IPv4", `postgresql://${DEMO_USERNAME}:password@0x7f000001/${DEMO_DATABASE}`],
    ["leading-zero IPv4", `postgresql://${DEMO_USERNAME}:password@0177.0.0.1/${DEMO_DATABASE}`],
    ["IPv6", `postgresql://${DEMO_USERNAME}:password@[::1]/${DEMO_DATABASE}`],
    ["ambiguous username", `postgresql://demo%40user:password@localhost/${DEMO_DATABASE}`],
    ["password without username", `postgresql://:password@localhost/${DEMO_DATABASE}`],
  ])("rejects unsupported or ambiguous target form: %s", async (_name, DATABASE_URL) => {
    const fixture = runtimeFixture();
    await expect(runDemoCatalogSeed(
      permittedEnvironment({ DATABASE_URL }),
      fixture.runtime,
    )).rejects.toThrow("DEMO_SEED_DATABASE_URL_INVALID");
    expect(fixture.connect).not.toHaveBeenCalled();
    expect(fixture.runDestructiveSeedBody).not.toHaveBeenCalled();
  });

  it("keeps the seed module inert when imported", () => {
    const tsxLoader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
    const seedUrl = pathToFileURL(join(ROOT, "prisma", "seed.ts")).href;
    const result = spawnSync(process.execPath, [
      "--import", tsxLoader,
      "--input-type=module",
      "--eval", `await import(${JSON.stringify(seedUrl)});`,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://must-not-connect.invalid/import_guard",
        MIRA_DEMO_SEED_EXPECTED_DATABASE: "import_guard",
        MIRA_DEMO_SEED_ACKNOWLEDGEMENT: "IMPORT_MUST_BE_INERT",
      },
    });

    expect({ status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr })
      .toEqual({ status: 0, signal: null, stdout: "", stderr: "" });
  });

  it("keeps ordinary verify and production/runtime sources unable to reach the demo seed", async () => {
    const packageSource = await readFile(join(ROOT, "package.json"), "utf8");
    expect(packageSource).toMatch(/"verify": "npm run typecheck && npm run lint && npm run test"/u);
    expect(packageSource).toMatch(/"seed": "tsx prisma\/seed\.ts"/u);

    const files = await productionFiles();
    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/prisma\/(?:seed|demo-seed-guard)/u);
    }
  });
});

function permittedEnvironment(
  overrides: Readonly<Record<string, string | undefined>> = {},
): Readonly<Record<string, string | undefined>> {
  return Object.freeze({
    NODE_ENV: "development",
    DATABASE_URL: DEMO_DATABASE_URL,
    MIRA_DEMO_SEED_EXPECTED_DATABASE: DEMO_DATABASE,
    MIRA_DEMO_SEED_ACKNOWLEDGEMENT: acknowledgementFor(DEMO_TARGET),
    ...overrides,
  });
}

function acknowledgementFor(target: string): string {
  return `${DEMO_SEED_ACKNOWLEDGEMENT_PREFIX}${target}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "NON_ERROR_FAILURE";
}

type RuntimeFixtureOptions = Readonly<{
  reportedDatabase?: string;
  currentUser?: string;
  currentSchema?: string;
  expectedHost?: string;
  expectedPort?: number;
}>;

function runtimeFixture(options: RuntimeFixtureOptions = {}) {
  const reportedDatabase = options.reportedDatabase ?? DEMO_DATABASE;
  const currentUser = options.currentUser ?? DEMO_USERNAME;
  const currentSchema = options.currentSchema ?? "public";
  const events: string[] = [];
  const runDestructiveSeedBody = vi.fn(() => {
    events.push("run-destructive-seed-body");
    return Promise.resolve();
  });
  const connect = vi.fn((
    pgConfig: DemoSeedPgConfig,
    prismaPgOptions: DemoSeedPrismaPgOptions,
  ) => {
    events.push("connect");
    expect(pgConfig.user).toBe(DEMO_USERNAME);
    expect(pgConfig.host).toBe(options.expectedHost ?? DEMO_HOSTNAME);
    expect(pgConfig.port).toBe(options.expectedPort ?? 5432);
    expect(pgConfig.database).toBe(DEMO_DATABASE);
    expect(prismaPgOptions.schema).toBe("public");
    expect(Object.keys(pgConfig)).toEqual(["user", "host", "port", "database"]);
    expect(typeof pgConfig.password).toBe("string");
    expect(Object.prototype.propertyIsEnumerable.call(pgConfig, "password")).toBe(false);
    const effectivePgClient = new Client(pgConfig);
    expect(effectivePgClient.user).toBe(DEMO_USERNAME);
    expect(effectivePgClient.host).toBe(options.expectedHost ?? DEMO_HOSTNAME);
    expect(effectivePgClient.port).toBe(options.expectedPort ?? 5432);
    expect(effectivePgClient.database).toBe(DEMO_DATABASE);
    return Object.freeze({
      readCurrentIdentity() {
        events.push("read-current-identity");
        return Promise.resolve(Object.freeze({
          databaseName: reportedDatabase,
          currentUser,
          currentSchema,
        }));
      },
      runDestructiveSeedBody,
      disconnect() {
        events.push("disconnect");
        return Promise.resolve();
      },
    });
  });
  const runtime: DemoSeedRuntime = Object.freeze({ connect });
  return Object.freeze({ events, runDestructiveSeedBody, connect, runtime });
}

async function productionFiles(): Promise<readonly string[]> {
  const roots = ["src", "scripts", "containers", ".github/workflows", "prisma/migrations"];
  const files = (await Promise.all(roots.map((root) => filesUnder(join(ROOT, root))))).flat();
  return files.filter((file) => {
    const extension = extname(file);
    return ([".ts", ".tsx", ".mts", ".js", ".mjs", ".json", ".yml", ".yaml", ".sql"]
      .includes(extension) || file.endsWith("Dockerfile"))
      && !file.includes("/__tests__/")
      && !file.endsWith(".test.ts")
      && !file.endsWith(".integration.test.ts");
  });
}

async function filesUnder(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : Promise.resolve([path]);
  }));
  return nested.flat();
}
